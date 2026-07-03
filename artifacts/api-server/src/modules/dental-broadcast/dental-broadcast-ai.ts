import { CHAT_MODEL, createChatCompletion } from "../../lib/openrouter-client";
import { aiCreditsService } from "../../shared/ai-credits";
import { InsufficientAiCreditsError } from "../../shared/errors";
import { logger } from "../../lib/logger";

export type BroadcastToothProblem = {
  toothFdi: number;
  label: string;
};

const CTA_LINE = "Напишите «Продолжить», и мы подберём удобное время 🤍";

function buildProblemsContext(problems: BroadcastToothProblem[]): string {
  return problems
    .map((p) => `Зуб ${p.toothFdi}: ${p.label}`)
    .join("\n");
}

function validateAiMessage(text: string, firstName: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length < 80 || trimmed.length > 1200) return null;
  if (!trimmed.toLowerCase().includes(firstName.toLowerCase().slice(0, 3))) return null;
  if (!trimmed.includes("Продолжить") && !trimmed.includes("продолжить")) return null;
  return trimmed;
}

export async function generateBroadcastMessageAi(params: {
  clinicId: string;
  patientName: string;
  problems: BroadcastToothProblem[];
  clinicName?: string;
  fallbackMessage: string;
}): Promise<{ message: string; usedAi: boolean }> {
  const { clinicId, patientName, problems, clinicName, fallbackMessage } = params;
  if (problems.length === 0) return { message: fallbackMessage, usedAi: false };

  const firstName = patientName.trim().split(" ")[0] ?? patientName;

  try {
    await aiCreditsService.consumeCredits({
      clinicId,
      feature: "dental_broadcast",
      description: `Рассылка: ${patientName}`,
    });
  } catch (err) {
    if (err instanceof InsufficientAiCreditsError) {
      logger.warn({ clinicId }, "[DentalBroadcastAI] Insufficient credits — using template");
      return { message: fallbackMessage, usedAi: false };
    }
    throw err;
  }

  const systemPrompt = `Ты — ассистент стоматологической клиники. Напиши короткое персональное WhatsApp-сообщение пациенту на русском языке.

Правила:
- Обращайся по имени (${firstName})
- Упомяни конкретные зубы и процедуры ТОЛЬКО из предоставленных данных — ничего не выдумывай
- Тон: заботливый, понятный пациенту, без медицинского жаргона и внутренних аббревиатур
- 4–8 предложений, можно использовать эмодзи умеренно (👋 🦷 🤍)
- Обязательно заверши призывом: «${CTA_LINE}»
- Не упоминай ИИ, ботов или автоматизацию
- Не указывай цены и точные даты`;

  const userPrompt = `Клиника: ${clinicName ?? "стоматология"}
Пациент: ${patientName}
Нелечёные находки:
${buildProblemsContext(problems)}

Напиши только текст сообщения, без кавычек и пояснений.`;

  try {
    const response = await createChatCompletion(
      {
        model: CHAT_MODEL,
        max_tokens: 500,
        temperature: 0.55,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      },
      { timeoutMs: 25_000, label: "dentalBroadcastMessage" },
    );

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const validated = validateAiMessage(raw, firstName);
    if (!validated) {
      logger.warn({ clinicId, rawLength: raw.length }, "[DentalBroadcastAI] Invalid AI output — using template");
      return { message: fallbackMessage, usedAi: false };
    }

    return { message: validated, usedAi: true };
  } catch (err) {
    logger.warn({ err, clinicId }, "[DentalBroadcastAI] Generation failed — using template");
    return { message: fallbackMessage, usedAi: false };
  }
}
