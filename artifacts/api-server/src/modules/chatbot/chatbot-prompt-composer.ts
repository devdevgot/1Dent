import { createHash } from "node:crypto";
import { createChatCompletion, PROMPT_COMPOSER_MODEL } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";
import type { ManagerExample } from "./ai-classifier";

export const KNOWLEDGE_CONTEXT_MAX_CHARS = 20_000;

export interface ChatbotPromptComposeInputs {
  clinicId: string;
  clinicName: string;
  knowledgeText: string;
  priceListText: string;
  officialBranches: string[];
  doctorsList: string;
  managerExamples: ManagerExample[];
}

interface CachedComposedPrompt {
  hash: string;
  prompt: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const composedPromptCache = new Map<string, CachedComposedPrompt>();

function hashComposeInputs(inputs: ChatbotPromptComposeInputs): string {
  const payload = JSON.stringify({
    clinicName: inputs.clinicName,
    knowledgeText: inputs.knowledgeText.slice(0, KNOWLEDGE_CONTEXT_MAX_CHARS),
    priceListText: inputs.priceListText.slice(0, 8000),
    officialBranches: inputs.officialBranches,
    doctorsList: inputs.doctorsList,
    managerExamples: inputs.managerExamples.map((e) => [e.userMessage, e.managerResponse]),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

function buildManagerExamplesBlock(examples: ManagerExample[]): string {
  if (!examples.length) return "(примеры не заданы)";
  return examples
    .slice(0, 8)
    .map((e, i) => `${i + 1}. Пациент: ${e.userMessage}\n   Менеджер: ${e.managerResponse}`)
    .join("\n\n");
}

function buildFallbackComposedPrompt(inputs: ChatbotPromptComposeInputs): string {
  const branches =
    inputs.officialBranches.length > 0
      ? inputs.officialBranches.map((b, i) => `${i + 1}. ${b}`).join("\n")
      : "(не указаны — смотри базу знаний)";

  return [
    `Ты — AI-ассистент стоматологической клиники «${inputs.clinicName}».`,
    "Общайся как живой менеджер в WhatsApp: коротко, по делу, на языке пациента.",
    "Ты не врач — не ставишь диагнозы.",
    "",
    "=== БАЗА ЗНАНИЙ КЛИНИКИ ===",
    inputs.knowledgeText.trim() || "(пусто — не выдумывай факты)",
    "",
    "=== ПРАЙС-ЛИСТ ===",
    inputs.priceListText.trim() || "(не указан)",
    "",
    "=== ФИЛИАЛЫ ===",
    branches,
    "",
    "=== ВРАЧИ ===",
    inputs.doctorsList.trim() || "(список уточняется при записи)",
    "",
    "=== СТИЛЬ МЕНЕДЖЕРА (примеры) ===",
    buildManagerExamplesBlock(inputs.managerExamples),
    "",
    "=== ПРАВИЛА ===",
    "1. Отвечай на вопрос пациента из базы знаний. Не выдумывай цены, адреса, врачей.",
    "2. Не навязывай этапы — веди естественный диалог. Запись предлагай когда уместно.",
    "3. Коротко: 1–2 предложения. Один вопрос за раз.",
    "4. Без скидок/акций без запроса. Не передавай администратору — подбирай врача и слоты сам.",
    "5. Не проси ИИН в начале — пациент идентифицирован по WhatsApp.",
  ].join("\n");
}

const OPUS_META_PROMPT = `Ты составляешь SYSTEM PROMPT для AI-ассистента стоматологической клиники в WhatsApp.

На входе — сырые данные клиники. Сформируй один связный system prompt на русском языке со структурой:
- ROLE (кто ты, тон общения)
- БАЗА ЗНАНИЙ (все факты из источников — сохрани адреса, цены, услуги, часы, телефоны)
- ПРАЙС-ЛИСТ
- ФИЛИАЛЫ
- ВРАЧИ
- СТИЛЬ МЕНЕДЖЕРА (из примеров — тон, длина, эмодзи)
- ПРАВИЛА ДИАЛОГА (естественный диалог без жёстких этапов; не выдумывать факты; короткие ответы)

ВАЖНО:
- Не добавляй факты, которых нет во входных данных.
- Не используй mind map, этапы воронки, FSM.
- Промпт должен быть готов для вставки в LLM как system message.
Верни ТОЛЬКО текст промпта, без markdown-обёрток и комментариев.`;

export function invalidateComposedPromptCache(clinicId: string): void {
  composedPromptCache.delete(clinicId);
}

export async function getComposedChatbotPrompt(inputs: ChatbotPromptComposeInputs): Promise<string> {
  const hash = hashComposeInputs(inputs);
  const cached = composedPromptCache.get(inputs.clinicId);
  if (cached && cached.hash === hash && cached.expiresAt > Date.now()) {
    return cached.prompt;
  }

  const userPayload = [
    `Клиника: ${inputs.clinicName}`,
    "",
    "=== БАЗА ЗНАНИЙ ===",
    inputs.knowledgeText.slice(0, KNOWLEDGE_CONTEXT_MAX_CHARS) || "(пусто)",
    "",
    "=== ПРАЙС-ЛИСТ ===",
    inputs.priceListText.slice(0, 8000) || "(пусто)",
    "",
    "=== ФИЛИАЛЫ ===",
    inputs.officialBranches.length ? inputs.officialBranches.join("\n") : "(пусто)",
    "",
    "=== ВРАЧИ ===",
    inputs.doctorsList || "(пусто)",
    "",
    "=== ПРИМЕРЫ МЕНЕДЖЕРА ===",
    buildManagerExamplesBlock(inputs.managerExamples),
  ].join("\n");

  try {
    const completion = await createChatCompletion(
      {
        model: PROMPT_COMPOSER_MODEL,
        messages: [
          { role: "system", content: OPUS_META_PROMPT },
          { role: "user", content: userPayload },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      },
      { timeoutMs: 90_000, label: "chatbotPromptComposer" },
    );
    const composed = completion.choices[0]?.message?.content?.trim();
    if (composed && composed.length > 200) {
      composedPromptCache.set(inputs.clinicId, {
        hash,
        prompt: composed,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return composed;
    }
    logger.warn("[PromptComposer] Opus returned empty/short prompt — using fallback");
  } catch (err) {
    logger.error({ err }, "[PromptComposer] Opus composition failed — using fallback");
  }

  const fallback = buildFallbackComposedPrompt(inputs);
  composedPromptCache.set(inputs.clinicId, {
    hash,
    prompt: fallback,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return fallback;
}
