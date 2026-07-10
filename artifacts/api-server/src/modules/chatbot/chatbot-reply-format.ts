/** LLM-structured reply: one or more WhatsApp bubbles with optional pauses. */
export interface ChatbotReply {
  parts: string[];
  pausesMs?: number[];
}

export interface ReplyPolishOptions {
  clinicName?: string | null;
  maxParts?: number;
  recentAssistantTexts?: string[];
}

/** Plain-text style note appended to chat system prompts (no JSON output format). */
export const CHAT_STYLE_PROMPT = `
Стиль WhatsApp (живой менеджер клиники, не робот):
- Кратко: обычно одно сообщение, максимум два коротких
- Один вопрос за раз, без длинных списков и лишних пояснений
- Не повторяй вопросы из недавних сообщений
- Отвечай обычным текстом, без JSON и markdown
`.trim();

/** @deprecated Use CHAT_STYLE_PROMPT — kept for existing imports. */
export const HUMAN_MESSAGING_PROMPT = CHAT_STYLE_PROMPT;

export function replyFromText(text: string): ChatbotReply {
  const trimmed = text.trim();
  return trimmed ? { parts: [trimmed], pausesMs: [0] } : { parts: [], pausesMs: [0] };
}

/** Split plain-text LLM output into up to maxParts WhatsApp bubbles at sentence boundaries. */
export function splitTextToReply(text: string, maxParts = 2): ChatbotReply {
  const trimmed = text.trim();
  if (!trimmed) return replyFromText("");

  const cap = Math.max(1, maxParts);
  if (cap === 1) return replyFromText(trimmed);

  const sentences = trimmed
    .split(/(?<=[.!?…])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length <= 1 || trimmed.length <= 180) {
    return replyFromText(trimmed);
  }

  const mid = Math.ceil(sentences.length / cap);
  const parts: string[] = [];
  for (let i = 0; i < sentences.length && parts.length < cap; i += mid) {
    const chunk = sentences.slice(i, i + mid).join(" ").trim();
    if (chunk) parts.push(chunk);
  }

  if (parts.length <= 1) return replyFromText(trimmed);

  return normalizeReply({ parts, pausesMs: defaultPauses(parts) });
}

export function joinChatbotReply(reply: ChatbotReply): string {
  return reply.parts.filter(Boolean).join("\n\n");
}

export function mergeReply(
  ai: ChatbotReply | null,
  fallback: string,
  opts?: ReplyPolishOptions,
): ChatbotReply {
  const reply = ai?.parts?.length ? normalizeReply(ai) : replyFromText(fallback);
  return polishReply(reply, opts);
}

/** Append suffix to last part, or add a new bubble if suffix is a long block (e.g. slot list). */
export function appendToReply(reply: ChatbotReply, suffix: string): ChatbotReply {
  const extra = suffix.trim();
  if (!extra) return normalizeReply(reply);

  const base = normalizeReply(reply);
  if (extra.length > 100 || extra.includes("\n•")) {
    const pause = estimateTypingPause(base.parts[base.parts.length - 1] ?? "");
    return {
      parts: [...base.parts, extra],
      pausesMs: [...defaultPauses(base.parts), pause],
    };
  }

  const parts = [...base.parts];
  parts[parts.length - 1] = `${parts[parts.length - 1] ?? ""}${suffix}`;
  return { parts, pausesMs: base.pausesMs ?? defaultPauses(parts) };
}

export function normalizeReply(raw: ChatbotReply): ChatbotReply {
  const parts = raw.parts.map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { parts: [], pausesMs: [0] };

  let pausesMs = raw.pausesMs?.slice(0, parts.length) ?? defaultPauses(parts);
  if (pausesMs.length < parts.length) {
    pausesMs = [...pausesMs, ...defaultPauses(parts.slice(pausesMs.length))];
  }
  pausesMs[0] = 0;
  return { parts, pausesMs };
}

export function polishReply(raw: ChatbotReply, opts?: ReplyPolishOptions): ChatbotReply {
  const normalized = normalizeReply(raw);
  const clinicName = opts?.clinicName?.trim();
  const maxParts = opts?.maxParts ?? 2;
  const recent = (opts?.recentAssistantTexts ?? []).map(normalizeForSimilarity).filter(Boolean);
  const cleaned: string[] = [];

  for (const part of normalized.parts) {
    const withoutBadIdentity = sanitizeAssistantIdentity(part, clinicName);
    const text = collapseRepeatedSentences(withoutBadIdentity).trim();
    if (!text) continue;
    if (recent.some((prev) => areSimilar(prev, text))) continue;
    if (cleaned.some((existing) => areSimilar(existing, text))) continue;
    cleaned.push(text);
    if (cleaned.length >= maxParts) break;
  }

  if (cleaned.length === 0 && normalized.parts[0]) {
    cleaned.push(sanitizeAssistantIdentity(normalized.parts[0], clinicName));
  }

  return normalizeReply({ parts: cleaned, pausesMs: defaultPauses(cleaned) });
}

function sanitizeAssistantIdentity(text: string, clinicName?: string): string {
  if (!clinicName) return text;
  const escaped = escapeRegExp(clinicName);
  return text
    .replace(
      new RegExp(`(^|[\\s,.;:!?])((?:меня\\s+зовут|я\\s+—|я\\s+-|я\\s+это)\\s+["«]?${escaped}["»]?)`, "giu"),
      `Я — AI-ассистент клиники «${clinicName}»`,
    )
    .replace(
      new RegExp(`(^|[\\s,.;:!?])(((?:мое|моё)\\s+имя)\\s+["«]?${escaped}["»]?)`, "giu"),
      `Я — AI-ассистент клиники «${clinicName}»`,
    );
}

function collapseRepeatedSentences(text: string): string {
  const sentences = text
    .split(/(?<=[.!?…])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 1) return text;

  const unique: string[] = [];
  for (const sentence of sentences) {
    if (!unique.some((existing) => areSimilar(existing, sentence))) unique.push(sentence);
  }
  return unique.join(" ");
}

function areSimilar(a: string, b: string): boolean {
  const aNorm = normalizeForSimilarity(a);
  const bNorm = normalizeForSimilarity(b);
  if (!aNorm || !bNorm) return false;
  if (aNorm === bNorm) return true;
  if (aNorm.length > 12 && bNorm.includes(aNorm)) return true;
  if (bNorm.length > 12 && aNorm.includes(bNorm)) return true;

  const aWords = new Set(aNorm.split(" ").filter((w) => w.length > 2));
  const bWords = new Set(bNorm.split(" ").filter((w) => w.length > 2));
  if (aWords.size === 0 || bWords.size === 0) return false;
  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) overlap++;
  }
  const similarity = overlap / Math.min(aWords.size, bWords.size);
  return similarity >= 0.95;
}

function normalizeForSimilarity(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseChatbotReplyJson(content: string): ChatbotReply | null {
  try {
    const parsed = JSON.parse(content) as { parts?: unknown; pausesMs?: unknown };
    if (!Array.isArray(parsed.parts)) return null;
    const parts = parsed.parts.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
    if (parts.length === 0) return null;
    const pausesMs = Array.isArray(parsed.pausesMs)
      ? parsed.pausesMs.filter((n): n is number => typeof n === "number" && n >= 0)
      : undefined;
    return normalizeReply({ parts, pausesMs });
  } catch {
    return null;
  }
}

export function defaultPauses(parts: string[]): number[] {
  const pauses: number[] = [0];
  for (let i = 1; i < parts.length; i++) {
    pauses.push(estimateTypingPause(parts[i - 1] ?? ""));
  }
  return pauses;
}

export function estimateTypingPause(previousPart: string): number {
  const len = previousPart.length;
  return Math.min(2800, Math.max(700, 500 + len * 28));
}
