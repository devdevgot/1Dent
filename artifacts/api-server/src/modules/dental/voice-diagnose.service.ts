import { createChatCompletion, parseLlmJson } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";

export const VOICE_STT_AUDIO_MODEL =
  process.env["VOICE_STT_AUDIO_MODEL"] ?? "google/gemini-2.5-flash";
export const VOICE_STT_MODEL =
  process.env["VOICE_STT_MODEL"] ?? "openai/gpt-4o-mini-transcribe";
export const VOICE_STT_FALLBACK_MODEL =
  process.env["VOICE_STT_FALLBACK_MODEL"] ?? "openai/whisper-large-v3-turbo";
export const VOICE_PARSE_MODEL =
  process.env["VOICE_PARSE_MODEL"] ?? "google/gemini-2.5-flash";
export const VOICE_PARSE_FALLBACK_MODEL =
  process.env["VOICE_PARSE_FALLBACK_MODEL"] ?? "google/gemini-2.5-pro";

const STT_LONG_AUDIO_BYTES = 400_000;
const STT_TIMEOUT_LONG_MS = 55_000;
const STT_TIMEOUT_SHORT_MS = 28_000;
const PARSE_TIMEOUT_MS = 45_000;
const PARSE_FALLBACK_TIMEOUT_MS = 60_000;
const PARSE_CHUNK_TIMEOUT_MS = 28_000;
const PARSE_CHUNK_FALLBACK_TIMEOUT_MS = 45_000;
const PARSE_CHUNK_MAX_CHARS = 2_200;
const PARSE_MAX_TOKENS_CAP = 16_000;
function sttMaxTokens(bufferBytes: number): number {
  return Math.min(8_000, Math.max(2_000, Math.ceil(bufferBytes / 6)));
}

function parseMaxTokens(transcript: string): number {
  // The JSON output echoes the doctor's words (diagnosisText/spokenProcedure/notes)
  // plus structural overhead per tooth. Cyrillic is token-dense (~2 chars/token),
  // so a 20-30 tooth exam needs a generous budget — truncated JSON loses everything.
  return Math.min(12_000, Math.max(3_000, Math.ceil(transcript.length * 1.5)));
}

/** Split long transcripts near FDI tooth boundaries for parallel LLM parse. */
export function splitTranscriptForParsing(transcript: string): string[] {
  const trimmed = transcript.trim();
  if (trimmed.length <= PARSE_CHUNK_MAX_CHARS) return [trimmed];

  const parts = trimmed.split(/(?=(?:^|\s)(?:1[1-8]|2[1-8]|3[1-8]|4[1-8])(?:\s|[-–—]|$))/u);
  if (parts.length <= 1) {
    const mid = Math.floor(trimmed.length / 2);
    const splitAt = trimmed.lastIndexOf(". ", mid);
    if (splitAt > 0) {
      return [trimmed.slice(0, splitAt + 1).trim(), trimmed.slice(splitAt + 1).trim()].filter(Boolean);
    }
    return [trimmed];
  }

  const chunks: string[] = [];
  let current = "";
  for (const part of parts) {
    const next = (current + part).trim();
    if (next.length > PARSE_CHUNK_MAX_CHARS && current.trim()) {
      chunks.push(current.trim());
      current = part;
    } else {
      current = next;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [trimmed];
}

function mergeDiagnosisRows(rows: VoiceDiagnosisRow[]): VoiceDiagnosisRow[] {
  const byFdi = new Map<number, VoiceDiagnosisRow>();
  for (const row of rows) {
    byFdi.set(row.fdi, row);
  }
  return [...byFdi.values()].sort((a, b) => a.fdi - b.fdi);
}

const MIN_AUDIO_BYTES = 1_000;

const VALID_CONDITIONS = new Set([
  "healthy", "cavity", "treated", "crown", "root_canal",
  "implant", "missing", "extraction_needed",
]);

export type VoiceDiagnosisRow = {
  fdi: number;
  condition: string;
  notes: string;
  diagnosisText: string;
  spokenProcedure: string;
};

function getReferer(): string {
  return (
    process.env["PUBLIC_URL"] ??
    process.env["FRONTEND_URL"] ??
    process.env["WEBHOOK_BASE_URL"] ??
    "https://www.1dent.kz"
  );
}

/** Map multer mime / filename to OpenRouter audio format slug. */
export function resolveAudioFormat(mimetype: string, originalname?: string): string {
  const name = (originalname ?? "").toLowerCase();
  const mime = mimetype.toLowerCase();

  if (mime.includes("mp4") || mime.includes("m4a") || name.endsWith(".m4a") || name.endsWith(".mp4")) return "m4a";
  if (mime.includes("mpeg") || mime.includes("mp3") || name.endsWith(".mp3")) return "mp3";
  if (mime.includes("ogg") || name.endsWith(".ogg")) return "ogg";
  if (mime.includes("wav") || name.endsWith(".wav")) return "wav";
  if (mime.includes("aac") || name.endsWith(".aac")) return "aac";
  if (mime.includes("flac") || name.endsWith(".flac")) return "flac";
  if (mime.includes("webm") || name.endsWith(".webm")) return "webm";
  return "webm";
}

const VOICE_VERBATIM_STT_PROMPT = `Транскрибируй аудио ДОСЛОВНО.

- Пиши ровно то, что сказано, слово в слово, в порядке произнесения.
- Врач может говорить на русском, казахском, узбекском, кыргызском, английском или смеси языков — сохраняй каждую фразу на том языке, на котором она произнесена.
- НЕ переводи на русский. НЕ объединяй языки в один.
- Допускается базовая пунктуация.
- Только текст транскрипции, без комментариев и заголовков.`;

const VOICE_PARSE_SYSTEM_PROMPT = `Ты — стоматологический ассистент. Разбери устный осмотр зубов и верни структурированный JSON.

Языки врача: русский, казахский, узбекский, кыргызский, английский и их смесь в одной записи.
Сохраняй оригинальные формулировки врача в diagnosisText и spokenProcedure (на языке, на котором сказано).

Номера зубов — формат FDI:
- 11–18 верхний правый, 21–28 верхний левый, 31–38 нижний левый, 41–48 нижний правый.

Перевод позиций между языками (примеры):
- RU: «16 зуб», «шестнадцатый», «16-й» → 16
- KK: «16-шы тіс», «он алтыншы» → 16
- UZ: «16-tish», «o'n oltinchi» → 16
- KY: «16-чи тиш», «он алтынчы» → 16
- EN: «tooth sixteen», «#16» → 16

Примеры естественной речи врача:
- «16 зуб глубокий кариес, будем использовать композитную пломбу»
  → fdi:16, condition:cavity, diagnosisText:"глубокий кариес", spokenProcedure:"композитная пломба"
- «O'n oltinchi tish — karies, plomba qo'yamiz»
  → fdi:16, condition:cavity, diagnosisText:"karies", spokenProcedure:"plomba"

Допустимые condition:
healthy, cavity, treated, crown, root_canal, implant, missing, extraction_needed

Правила:
1. Точный FDI, если номер назван явно (включая «16 зуб», «зуб 16»).
2. Позиционные описания переводи в FDI по контексту квадранта.
3. Не включай healthy.
4. diagnosisText — медицинский диагноз словами врача (кариес, пульпит и т.д.).
5. spokenProcedure — названная услуга, материал или метод (пломба, коронка, имплант и т.д.); иначе "".
6. notes — краткая клиническая заметка на языке врача.

Верни ТОЛЬКО JSON объект:
{"diagnoses":[{"fdi":16,"condition":"cavity","diagnosisText":"...","spokenProcedure":"...","notes":"..."}]}

Если ничего не разобрано — {"diagnoses":[]}.`;

async function callAudioChatTranscription(
  apiKey: string,
  model: string,
  buffer: Buffer,
  mime: string,
  filename: string,
  timeoutMs: number,
  maxTokens: number,
): Promise<string> {
  const format = resolveAudioFormat(mime, filename);
  const base64Audio = buffer.toString("base64");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": getReferer(),
        "X-Title": "1Dent",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: VOICE_VERBATIM_STT_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Транскрибируй это аудио осмотра зубов дословно, без перевода.",
              },
              {
                type: "input_audio",
                input_audio: { data: base64Audio, format },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`Audio STT ${model} error ${res.status}: ${rawText.slice(0, 400)}`);
    }

    let json: { choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }> };
    try {
      json = JSON.parse(rawText) as typeof json;
    } catch {
      throw new Error(`Audio STT ${model} returned non-JSON response`);
    }

    const content = json.choices?.[0]?.message?.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      const text = content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n")
        .trim();
      return text;
    }
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function callTranscriptionApi(
  apiKey: string,
  model: string,
  buffer: Buffer,
  mime: string,
  filename: string,
  timeoutMs: number,
): Promise<string> {
  const format = resolveAudioFormat(mime, filename);
  const base64Audio = buffer.toString("base64");

  const body: Record<string, unknown> = {
    model,
    input_audio: { data: base64Audio, format },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": getReferer(),
        "X-Title": "1Dent",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`STT ${model} error ${res.status}: ${rawText.slice(0, 400)}`);
    }

    let json: { text?: string };
    try {
      json = JSON.parse(rawText) as { text?: string };
    } catch {
      throw new Error(`STT ${model} returned non-JSON response`);
    }

    return json.text?.trim() ?? "";
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribeVoiceAudio(
  apiKey: string,
  buffer: Buffer,
  mime: string,
  filename: string,
): Promise<{ transcript: string; model: string; ms: number }> {
  if (buffer.length < MIN_AUDIO_BYTES) {
    throw new VoiceTranscriptionError(
      "Запись слишком короткая. Говорите дольше и ближе к микрофону.",
    );
  }

  const isLong = buffer.length >= STT_LONG_AUDIO_BYTES;
  const timeoutMs = isLong ? STT_TIMEOUT_LONG_MS : STT_TIMEOUT_SHORT_MS;
  const maxTokens = sttMaxTokens(buffer.length);
  const modelOrder = isLong
    ? [VOICE_STT_FALLBACK_MODEL, VOICE_STT_MODEL, VOICE_STT_AUDIO_MODEL]
    : [VOICE_STT_AUDIO_MODEL, VOICE_STT_MODEL, VOICE_STT_FALLBACK_MODEL];
  const models = modelOrder.filter((m, i, arr) => arr.indexOf(m) === i).slice(0, 2);

  let lastErr: unknown;
  for (const model of models) {
    const started = Date.now();
    try {
      const transcript = model === VOICE_STT_AUDIO_MODEL || model.includes("gemini")
        ? await callAudioChatTranscription(apiKey, model, buffer, mime, filename, timeoutMs, maxTokens)
        : await callTranscriptionApi(apiKey, model, buffer, mime, filename, timeoutMs);
      const ms = Date.now() - started;
      if (!transcript) {
        throw new Error(`STT ${model} returned empty transcript`);
      }
      logger.info({ model, ms, bytes: buffer.length, format: resolveAudioFormat(mime, filename), isLong }, "[VoiceDiagnose] STT ok");
      return { transcript, model, ms };
    } catch (err) {
      lastErr = err;
      logger.warn({ err, model, isLong }, "[VoiceDiagnose] STT model failed, trying next");
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error("Speech transcription failed");
}

/** Parses one chunk, falling back to the next model on failure (timeout, truncation, bad JSON). */
async function parseChunkWithFallback(
  chunk: string,
  models: string[],
  fullTranscript: string,
  chunkMeta?: { chunkIndex: number; chunkCount: number },
): Promise<VoiceDiagnosisRow[]> {
  const isChunked = Boolean(chunkMeta && chunkMeta.chunkCount > 1);
  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i]!;
    const timeoutMs = isChunked
      ? (i === 0 ? PARSE_CHUNK_TIMEOUT_MS : PARSE_CHUNK_FALLBACK_TIMEOUT_MS)
      : (i === 0 ? PARSE_TIMEOUT_MS : PARSE_FALLBACK_TIMEOUT_MS);
    try {
      return await callParseModel(chunk, model, timeoutMs, fullTranscript, chunkMeta);
    } catch (err) {
      lastErr = err;
      logger.warn(
        { err, model, hasNext: i < models.length - 1, chunkIndex: chunkMeta?.chunkIndex },
        "[VoiceDiagnose] Parse model failed for chunk",
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Voice diagnosis parse failed");
}

export async function parseVoiceDiagnoses(transcript: string): Promise<{
  diagnoses: VoiceDiagnosisRow[];
  ms: number;
  model: string;
  chunkCount: number;
  failedChunks: number;
}> {
  const started = Date.now();
  const models = [VOICE_PARSE_MODEL, VOICE_PARSE_FALLBACK_MODEL].filter(
    (m, i, arr) => arr.indexOf(m) === i,
  );
  const chunks = splitTranscriptForParsing(transcript);

  if (chunks.length === 1) {
    const diagnoses = await parseChunkWithFallback(chunks[0]!, models, transcript);
    const ms = Date.now() - started;
    logger.info({ ms, count: diagnoses.length, chunks: 1 }, "[VoiceDiagnose] Parse ok");
    return { diagnoses, ms, model: models[0]!, chunkCount: 1, failedChunks: 0 };
  }

  // Long exams (20-30 teeth): parse chunks in parallel, but let each chunk fall back
  // independently — one slow/failed chunk must not discard the teeth that parsed fine.
  const settled = await Promise.allSettled(
    chunks.map((chunk, index) =>
      parseChunkWithFallback(chunk, models, transcript, {
        chunkIndex: index,
        chunkCount: chunks.length,
      }),
    ),
  );

  const rows: VoiceDiagnosisRow[] = [];
  let failedChunks = 0;
  let firstErr: unknown;
  for (const result of settled) {
    if (result.status === "fulfilled") {
      rows.push(...result.value);
    } else {
      failedChunks += 1;
      firstErr = firstErr ?? result.reason;
    }
  }

  if (failedChunks === chunks.length) {
    throw firstErr instanceof Error ? firstErr : new Error("Voice diagnosis parse failed");
  }

  const diagnoses = mergeDiagnosisRows(rows);
  const ms = Date.now() - started;
  logger.info(
    { ms, count: diagnoses.length, chunks: chunks.length, failedChunks },
    "[VoiceDiagnose] Parse ok",
  );
  return { diagnoses, ms, model: models[0]!, chunkCount: chunks.length, failedChunks };
}

async function callParseModel(
  transcript: string,
  model: string,
  timeoutMs: number,
  fullTranscript?: string,
  chunk?: { chunkIndex: number; chunkCount: number },
): Promise<VoiceDiagnosisRow[]> {
  const userContent = chunk && chunk.chunkCount > 1
    ? `Фрагмент ${chunk.chunkIndex + 1} из ${chunk.chunkCount} полной расшифровки осмотра. Извлеки диагнозы только для зубов, упомянутых в этом фрагменте:\n"""\n${transcript}\n"""`
    : `Расшифровка осмотра (многоязычная, как сказал врач):\n"""\n${transcript}\n"""`;

  let maxTokens = parseMaxTokens(fullTranscript ?? transcript);
  let rows: unknown[] | null = null;

  // Up to 2 attempts: truncated output (finish_reason=length) or unparseable JSON
  // gets one retry with a doubled token budget before we give up and let the
  // caller fall back to the next model. Silently returning [] here used to drop
  // entire chunks of a long (20-30 teeth) exam.
  for (let attempt = 0; attempt < 2; attempt++) {
    const chatRes = await createChatCompletion(
      {
        model,
        messages: [
          { role: "system", content: VOICE_PARSE_SYSTEM_PROMPT },
          {
            role: "user",
            content: userContent,
          },
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      },
      { timeoutMs, label: `voice-diagnose-parse:${model}`, disableReasoning: true },
    );

    const choice = chatRes.choices[0];
    const raw = choice?.message?.content?.trim() ?? "";
    const truncated = choice?.finish_reason === "length";
    const parsed = raw ? parseLlmJson<{ diagnoses?: unknown[] }>(raw) : null;

    if (parsed && !truncated) {
      rows = Array.isArray(parsed.diagnoses) ? parsed.diagnoses : [];
      break;
    }

    if (attempt === 0) {
      logger.warn(
        { model, truncated, rawChars: raw.length, maxTokens, chunkIndex: chunk?.chunkIndex },
        "[VoiceDiagnose] Parse output truncated or invalid, retrying with larger budget",
      );
      maxTokens = Math.min(PARSE_MAX_TOKENS_CAP, maxTokens * 2);
      continue;
    }

    throw new Error(
      `Voice parse ${model} returned ${truncated ? "truncated" : "invalid"} JSON output`,
    );
  }

  return (rows ?? [])
    .filter(
      (d): d is Record<string, unknown> =>
        typeof d === "object" && d !== null,
    )
    .filter(
      (d) =>
        typeof d["fdi"] === "number" &&
        (d["fdi"] as number) >= 11 &&
        (d["fdi"] as number) <= 48 &&
        typeof d["condition"] === "string" &&
        VALID_CONDITIONS.has(d["condition"] as string) &&
        d["condition"] !== "healthy",
    )
    .map((d) => ({
      fdi: d["fdi"] as number,
      condition: d["condition"] as string,
      notes: typeof d["notes"] === "string" ? (d["notes"] as string) : "",
      diagnosisText: typeof d["diagnosisText"] === "string"
        ? (d["diagnosisText"] as string)
        : (typeof d["notes"] === "string" ? (d["notes"] as string) : ""),
      spokenProcedure: typeof d["spokenProcedure"] === "string" ? (d["spokenProcedure"] as string) : "",
    }));
}

export class VoiceTranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceTranscriptionError";
  }
}
