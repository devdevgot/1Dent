import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, knowledgeScriptsTable } from "@workspace/db";
import { createChatCompletion, PROMPT_COMPOSER_MODEL } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";
import { getCachedChatbotPromptComposerConfig } from "../platform-config/platform-config.service";
import type { ManagerExample } from "./ai-classifier";
import {
  buildPromptWithAmendments,
  formatAmendmentFromInstructions,
  splitComposedPrompt,
} from "./chatbot-prompt-amendments";

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
    "=== ФОРМАТ ОТВЕТОВ (2–3 пузыря WhatsApp) ===",
    "Модель отвечает JSON: reply — первое сообщение; replyParts — 2-е и 3-е.",
    "Пузырь 1: прямой ответ на вопрос (1–2 предложения, без списков).",
    "Пузырь 2: список филиалов/слотов/цен ИЛИ один уточняющий вопрос.",
    "Пузырь 3 (опционально): мягкое приглашение записаться.",
    "НЕ смешивай ответ, список и вопрос в одном пузыре.",
    "",
    "=== ПРАВИЛА ===",
    "1. Отвечай на вопрос пациента из базы знаний. Не выдумывай цены, адреса, врачей.",
    "2. Естественный диалог — сначала факт, потом уточнение во 2-м пузыре.",
    "3. Один вопрос за раз. Коротко, как живой менеджер.",
    "4. Без скидок/акций без запроса. Не передавай администратору — подбирай врача и слоты сам.",
    "5. Не проси ИИН в начале — пациент идентифицирован по WhatsApp.",
  ].join("\n");
}

export function invalidateComposedPromptCache(clinicId: string): void {
  composedPromptCache.delete(clinicId);
  void clearPersistedComposedPrompt(clinicId).catch((err) =>
    logger.warn({ err, clinicId }, "[PromptComposer] failed to clear persisted prompt"),
  );
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

export async function getComposedPromptStatus(clinicId: string): Promise<{
  exists: boolean;
  refined: boolean;
  length: number;
  prompt: string | null;
  amendmentsCount: number;
  amendments: string[];
  baseLength: number;
}> {
  const cached = composedPromptCache.get(clinicId);
  if (cached && cached.expiresAt > Date.now()) {
    const { base, amendments } = splitComposedPrompt(cached.prompt);
    return {
      exists: true,
      refined: cached.refined || amendments.length > 0,
      length: cached.prompt.length,
      prompt: cached.prompt,
      amendmentsCount: amendments.length,
      amendments,
      baseLength: base.length,
    };
  }

  const persisted = await loadPersistedComposedPrompt(clinicId);
  if (persisted) {
    const { base, amendments } = splitComposedPrompt(persisted.prompt);
    return {
      exists: true,
      refined: persisted.refined || amendments.length > 0,
      length: persisted.prompt.length,
      prompt: persisted.prompt,
      amendmentsCount: amendments.length,
      amendments,
      baseLength: base.length,
    };
  }

  return {
    exists: false,
    refined: false,
    length: 0,
    prompt: null,
    amendmentsCount: 0,
    amendments: [],
    baseLength: 0,
  };
}

async function loadPersistedComposedPrompt(
  clinicId: string,
): Promise<{ prompt: string; refined: boolean } | null> {
  const rows = await db
    .select({
      composedPrompt: knowledgeScriptsTable.composedPrompt,
      composedPromptRefined: knowledgeScriptsTable.composedPromptRefined,
    })
    .from(knowledgeScriptsTable)
    .where(eq(knowledgeScriptsTable.clinicId, clinicId))
    .limit(1);

  const prompt = rows[0]?.composedPrompt?.trim();
  if (!prompt) return null;

  return {
    prompt,
    refined: rows[0]?.composedPromptRefined ?? false,
  };
}

async function persistComposedPrompt(
  clinicId: string,
  prompt: string,
  refined: boolean,
): Promise<void> {
  const now = new Date();
  await db
    .insert(knowledgeScriptsTable)
    .values({
      id: randomUUID(),
      clinicId,
      composedPrompt: prompt,
      composedPromptRefined: refined,
      composedPromptAt: now,
    })
    .onConflictDoUpdate({
      target: knowledgeScriptsTable.clinicId,
      set: {
        composedPrompt: prompt,
        composedPromptRefined: refined,
        composedPromptAt: now,
      },
    });
}

async function clearPersistedComposedPrompt(clinicId: string): Promise<void> {
  await db
    .update(knowledgeScriptsTable)
    .set({
      composedPrompt: null,
      composedPromptRefined: false,
      composedPromptAt: null,
    })
    .where(eq(knowledgeScriptsTable.clinicId, clinicId));
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

/**
 * Append a new owner-defined rule to the existing prompt without modifying the base.
 */
export async function appendAmendmentToComposedPrompt(
  inputs: ChatbotPromptComposeInputs,
  ownerInstructions: string,
): Promise<{ prompt: string; amendment: string; amendmentsCount: number }> {
  const hash = hashComposeInputs(inputs);

  let currentPrompt: string | null = null;
  const cached = composedPromptCache.get(inputs.clinicId);
  if (cached && cached.expiresAt > Date.now()) {
    currentPrompt = cached.prompt;
  } else {
    const persisted = await loadPersistedComposedPrompt(inputs.clinicId);
    if (persisted) currentPrompt = persisted.prompt;
  }

  if (!currentPrompt?.trim()) {
    throw new Error("NO_COMPOSED_PROMPT");
  }

  const { base, amendments } = splitComposedPrompt(currentPrompt);
  const newRule = await formatAmendmentFromInstructions(ownerInstructions, inputs.clinicName);
  const nextAmendments = [...amendments, newRule];
  const prompt = buildPromptWithAmendments(base, nextAmendments);

  cacheComposedPrompt(inputs.clinicId, hash, prompt, true);

  return {
    prompt,
    amendment: newRule,
    amendmentsCount: nextAmendments.length,
  };
}

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
  void persistComposedPrompt(clinicId, prompt, refined).catch((err) =>
    logger.warn({ err, clinicId }, "[PromptComposer] failed to persist prompt"),
  );
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

export async function getComposedChatbotPrompt(inputs: ChatbotPromptComposeInputs): Promise<string> {
  const hash = hashComposeInputs(inputs);
  const cached = composedPromptCache.get(inputs.clinicId);
  if (cached && cached.hash === hash && cached.expiresAt > Date.now()) {
    return cached.prompt;
  }

  const persisted = await loadPersistedComposedPrompt(inputs.clinicId);
  if (persisted) {
    cacheComposedPrompt(inputs.clinicId, hash, persisted.prompt, persisted.refined);
    return persisted.prompt;
  }

  // Opus compose only via Knowledge tab — runtime uses fast deterministic fallback.
  return buildFallbackComposedPrompt(inputs);
}
