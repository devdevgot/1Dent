import { createHash } from "node:crypto";
import { createChatCompletion, PROMPT_COMPOSER_MODEL, PROMPT_REFINER_MODEL } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";
import { getCachedChatbotPromptComposerConfig } from "../platform-config/platform-config.service";
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
  refined: boolean;
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

export function invalidateComposedPromptCache(clinicId: string): void {
  composedPromptCache.delete(clinicId);
}

export function invalidateAllComposedPromptCaches(): void {
  composedPromptCache.clear();
}

export function getComposedPromptCacheStatus(clinicId: string): {
  exists: boolean;
  refined: boolean;
  length: number;
} {
  const cached = composedPromptCache.get(clinicId);
  if (!cached || cached.expiresAt <= Date.now()) {
    return { exists: false, refined: false, length: 0 };
  }
  return { exists: true, refined: cached.refined, length: cached.prompt.length };
}

function buildUserPayload(inputs: ChatbotPromptComposeInputs): string {
  return [
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
}

const SONNET_REFINE_META_PROMPT = `Ты улучшаешь system prompt для WhatsApp-ассистента стоматологической клиники.

На входе — черновик промпта (создан Claude Opus) и исходные данные клиники для проверки фактов.

Задачи:
- Улучши структуру, ясность и компактность без потери фактов
- Убери дубли и противоречия
- Сохрани ВСЕ факты из исходных данных (цены, адреса, врачи, услуги, часы)
- Не добавляй факты, которых нет во входных данных
- Сохрани правила: короткие ответы, естественный диалог, без жёстких этапов воронки

Верни ТОЛЬКО улучшенный текст system prompt, без markdown-обёрток и комментариев.`;

function cacheComposedPrompt(
  clinicId: string,
  hash: string,
  prompt: string,
  refined: boolean,
): void {
  composedPromptCache.set(clinicId, {
    hash,
    prompt,
    refined,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/** Force Opus to compose a fresh base prompt (not refined). */
export async function composeChatbotPromptWithOpus(
  inputs: ChatbotPromptComposeInputs,
): Promise<string> {
  const hash = hashComposeInputs(inputs);
  const userPayload = buildUserPayload(inputs);

  try {
    const opusMetaPrompt = getCachedChatbotPromptComposerConfig().opusMetaPrompt;
    const completion = await createChatCompletion(
      {
        model: PROMPT_COMPOSER_MODEL,
        messages: [
          { role: "system", content: opusMetaPrompt },
          { role: "user", content: userPayload },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      },
      { timeoutMs: 90_000, label: "chatbotPromptComposerOpus" },
    );
    const composed = completion.choices[0]?.message?.content?.trim();
    if (composed && composed.length > 200) {
      cacheComposedPrompt(inputs.clinicId, hash, composed, false);
      return composed;
    }
    logger.warn("[PromptComposer] Opus returned empty/short prompt — using fallback");
  } catch (err) {
    logger.error({ err }, "[PromptComposer] Opus composition failed — using fallback");
  }

  const fallback = buildFallbackComposedPrompt(inputs);
  cacheComposedPrompt(inputs.clinicId, hash, fallback, false);
  return fallback;
}

/** Refine the cached Opus prompt with Claude Sonnet 5. */
export async function refineComposedChatbotPrompt(
  inputs: ChatbotPromptComposeInputs,
): Promise<string> {
  const hash = hashComposeInputs(inputs);
  const cached = composedPromptCache.get(inputs.clinicId);
  if (!cached || cached.expiresAt <= Date.now()) {
    throw new Error("NO_COMPOSED_PROMPT");
  }

  const userPayload = [
    "=== ЧЕРНОВИК PROMPT (от Opus) ===",
    cached.prompt,
    "",
    "=== ИСХОДНЫЕ ДАННЫЕ КЛИНИКИ (проверь факты) ===",
    buildUserPayload(inputs),
  ].join("\n");

  const completion = await createChatCompletion(
    {
      model: PROMPT_REFINER_MODEL,
      messages: [
        { role: "system", content: SONNET_REFINE_META_PROMPT },
        { role: "user", content: userPayload },
      ],
      temperature: 0.25,
      max_tokens: 4096,
    },
    { timeoutMs: 60_000, label: "chatbotPromptRefinerSonnet" },
  );

  const refined = completion.choices[0]?.message?.content?.trim();
  if (!refined || refined.length < 200) {
    throw new Error("REFINE_FAILED");
  }

  cacheComposedPrompt(inputs.clinicId, hash, refined, true);
  return refined;
}

export async function getComposedChatbotPrompt(inputs: ChatbotPromptComposeInputs): Promise<string> {
  const hash = hashComposeInputs(inputs);
  const cached = composedPromptCache.get(inputs.clinicId);
  if (cached && cached.hash === hash && cached.expiresAt > Date.now()) {
    return cached.prompt;
  }

  return composeChatbotPromptWithOpus(inputs);
}
