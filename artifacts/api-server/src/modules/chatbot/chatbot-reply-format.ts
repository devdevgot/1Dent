/** LLM-structured reply: one or more WhatsApp bubbles with optional pauses. */
export interface ChatbotReply {
  parts: string[];
  pausesMs?: number[];
}

export const HUMAN_MESSAGING_PROMPT = `
СТИЛЬ ОБЩЕНИЯ В WHATSAPP (как живой менеджер клиники, не робот):
- Короткие сообщения-пузыри, как в мессенджере — не одна длинная простыня
- Допустимо 1–4 отдельных сообщения подряд, если так естественнее
- Между мыслями — логичные паузы (как будто печатаете)

ФОРМАТ ОТВЕТА — строго JSON (без markdown, без пояснений):
{
  "parts": ["текст первого сообщения", "текст второго сообщения"],
  "pausesMs": [0, 1200]
}

Правила поля parts:
- Каждый элемент — одно WhatsApp-сообщение (1–2 предложения, до ~250 символов)
- Приветствие — отдельная part
- Уточняющий вопрос — отдельная part
- Список слотов, цен или вариантов — отдельная part
- Подтверждение / итог — отдельная part
- Если весь ответ умещается в 1–2 коротких предложения — одна part

Правила поля pausesMs:
- Длина = длине parts; pausesMs[i] — пауза ПЕРЕД отправкой parts[i] (мс)
- Для первой part всегда 0
- Для следующих: 800–2500 мс — чем длиннее предыдущая part, тем больше пауза (имитация набора текста)
`.trim();

export function replyFromText(text: string): ChatbotReply {
  const trimmed = text.trim();
  return trimmed ? { parts: [trimmed], pausesMs: [0] } : { parts: [], pausesMs: [0] };
}

export function joinChatbotReply(reply: ChatbotReply): string {
  return reply.parts.filter(Boolean).join("\n\n");
}

export function mergeReply(ai: ChatbotReply | null, fallback: string): ChatbotReply {
  if (ai?.parts?.length) return normalizeReply(ai);
  return replyFromText(fallback);
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
