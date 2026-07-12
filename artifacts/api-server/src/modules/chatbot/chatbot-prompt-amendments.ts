import { createChatCompletion, PROMPT_REFINER_MODEL } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";

export const PROMPT_AMENDMENTS_MARKER = "=== ДОПОЛНИТЕЛЬНЫЕ УСЛОВИЯ (доработки клиники) ===";

const AMENDMENT_FORMAT_META = `Ты помогаешь владельцу стоматологической клиники добавить ОДНО новое правило к system prompt WhatsApp-бота.

КРИТИЧЕСКИ ВАЖНО:
- НЕ переписывай и НЕ цитируй существующий промпт
- НЕ меняй уже заданные правила
- Сформулируй только НОВОЕ правило на основе запроса пользователя
- 1–3 коротких предложения, императивный стиль («Всегда…», «Не…», «Если… — то…»)
- Без markdown, без нумерации, без кавычек вокруг всего ответа
- Не выдумывай факты о клинике (цены, врачи, адреса)`;

export function splitComposedPrompt(prompt: string): { base: string; amendments: string[] } {
  const trimmed = prompt.trim();
  const idx = trimmed.indexOf(PROMPT_AMENDMENTS_MARKER);
  if (idx === -1) {
    return { base: trimmed, amendments: [] };
  }

  const base = trimmed.slice(0, idx).trim();
  const block = trimmed.slice(idx + PROMPT_AMENDMENTS_MARKER.length).trim();
  if (!block) return { base, amendments: [] };

  const amendments = block
    .split(/\n+/)
    .map((line) => line.replace(/^\d+[\).\]]\s*/, "").trim())
    .filter(Boolean);

  return { base, amendments };
}

export function buildPromptWithAmendments(base: string, amendments: string[]): string {
  const cleanBase = base.trim();
  if (amendments.length === 0) return cleanBase;
  const numbered = amendments.map((a, i) => `${i + 1}. ${a}`).join("\n");
  return `${cleanBase}\n\n${PROMPT_AMENDMENTS_MARKER}\n${numbered}`;
}

/** Turn free-form owner notes into a single prompt rule (does not touch base prompt). */
export async function formatAmendmentFromInstructions(
  instructions: string,
  clinicName: string,
): Promise<string> {
  const trimmed = instructions.trim();
  if (!trimmed) throw new Error("EMPTY_INSTRUCTIONS");

  try {
    const completion = await createChatCompletion(
      {
        model: PROMPT_REFINER_MODEL,
        messages: [
          { role: "system", content: AMENDMENT_FORMAT_META },
          {
            role: "user",
            content: [
              `Клиника: ${clinicName}`,
              "",
              "Запрос владельца на доработку:",
              trimmed,
            ].join("\n"),
          },
        ],
        temperature: 0.2,
        max_tokens: 400,
      },
      { timeoutMs: 45_000, label: "chatbotPromptAmendmentFormat" },
    );

    const formatted = completion.choices[0]?.message?.content?.trim();
    if (formatted && formatted.length >= 8 && formatted.length <= 800) {
      return formatted.replace(/^\d+[\).\]]\s*/, "").trim();
    }
    logger.warn("[PromptAmendments] LLM returned empty/invalid amendment — using raw instructions");
  } catch (err) {
    logger.warn({ err }, "[PromptAmendments] format failed — using raw instructions");
  }

  return trimmed.slice(0, 800);
}
