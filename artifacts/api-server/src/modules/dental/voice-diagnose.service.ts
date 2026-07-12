import { createChatCompletion, parseLlmJson } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";

export const VOICE_STT_AUDIO_MODEL =
  process.env["VOICE_STT_AUDIO_MODEL"] ?? "google/gemini-2.5-flash";
export const VOICE_STT_MODEL =
  process.env["VOICE_STT_MODEL"] ?? "openai/gpt-4o-mini-transcribe";
export const VOICE_STT_FALLBACK_MODEL =
  process.env["VOICE_STT_FALLBACK_MODEL"] ?? "openai/whisper-large-v3-turbo";
export const VOICE_PARSE_MODEL =
  process.env["VOICE_PARSE_MODEL"] ?? "google/gemini-2.5-pro";

const STT_TIMEOUT_MS = 45_000;
const PARSE_TIMEOUT_MS = 28_000;
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
): Promise<string> {
  const format = resolveAudioFormat(mime, filename);
  const base64Audio = buffer.toString("base64");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);

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
        max_tokens: 2000,
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
): Promise<string> {
  const format = resolveAudioFormat(mime, filename);
  const base64Audio = buffer.toString("base64");

  const body: Record<string, unknown> = {
    model,
    input_audio: { data: base64Audio, format },
  };

  // Omit `language` — auto-detect handles RU/KK/UZ/KY/EN and code-switching.

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);

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

  const models = [
    VOICE_STT_AUDIO_MODEL,
    VOICE_STT_MODEL,
    VOICE_STT_FALLBACK_MODEL,
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  let lastErr: unknown;
  for (const model of models) {
    const started = Date.now();
    try {
      const transcript = model === VOICE_STT_AUDIO_MODEL || model.includes("gemini")
        ? await callAudioChatTranscription(apiKey, model, buffer, mime, filename)
        : await callTranscriptionApi(apiKey, model, buffer, mime, filename);
      const ms = Date.now() - started;
      if (!transcript) {
        throw new Error(`STT ${model} returned empty transcript`);
      }
      logger.info({ model, ms, bytes: buffer.length, format: resolveAudioFormat(mime, filename) }, "[VoiceDiagnose] STT ok");
      return { transcript, model, ms };
    } catch (err) {
      lastErr = err;
      logger.warn({ err, model }, "[VoiceDiagnose] STT model failed, trying next");
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error("Speech transcription failed");
}

export async function parseVoiceDiagnoses(transcript: string): Promise<{
  diagnoses: VoiceDiagnosisRow[];
  ms: number;
}> {
  const started = Date.now();

  const chatRes = await createChatCompletion(
    {
      model: VOICE_PARSE_MODEL,
      messages: [
        { role: "system", content: VOICE_PARSE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Расшифровка осмотра (многоязычная, как сказал врач):\n"""\n${transcript}\n"""`,
        },
      ],
      temperature: 0.1,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    },
    { timeoutMs: PARSE_TIMEOUT_MS, label: "voice-diagnose-parse", disableReasoning: true },
  );

  const raw = chatRes.choices[0]?.message?.content?.trim() ?? "{}";
  const parsed = parseLlmJson<{ diagnoses?: unknown[] }>(raw);
  const rows = Array.isArray(parsed?.diagnoses) ? parsed!.diagnoses! : [];

  const diagnoses: VoiceDiagnosisRow[] = rows
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

  const ms = Date.now() - started;
  logger.info({ model: VOICE_PARSE_MODEL, ms, count: diagnoses.length }, "[VoiceDiagnose] Parse ok");

  return { diagnoses, ms };
}

export class VoiceTranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceTranscriptionError";
  }
}
