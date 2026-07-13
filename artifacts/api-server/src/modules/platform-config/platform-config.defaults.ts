import type { ClinicPlan, PlanLimits } from "@workspace/db";
import { PLAN_LIMITS, TRIAL_LIMITS, FREE_LIMITS } from "../../shared/plan-limits";
import { EXTRACTION_TEMPLATES } from "../contracts/extraction-templates";

export type PaidPlanId = "starter" | "professional" | "enterprise";

export interface PlatformPlanEntry {
  id: PaidPlanId;
  name: string;
  price: number;
  subtitle: string;
  audience: string;
  badge?: string;
  recommended?: boolean;
  highlights: string[];
  limits: PlanLimits;
}

export interface PlatformPlansConfig {
  implementationFee: number;
  trialDays: number;
  plans: PlatformPlanEntry[];
}

export interface PlatformChatbotDefaults {
  defaultEnabled: boolean;
  greetingTemplate: string;
  followup24hTemplate: string;
  followup72hTemplate: string;
  followup168hTemplate: string;
  /** WhatsApp re-engagement template for ИИ Рассылка. Placeholders: {{firstName}}, {{toothLines}}, {{urgency}} */
  broadcastTemplate: string;
  /** Optional system prompt override for AI-generated broadcast messages */
  broadcastAiSystemPrompt: string;
  /** Default AI generation toggle for new clinics */
  broadcastAiEnabledDefault: boolean;
}

export const DEFAULT_BROADCAST_TEMPLATE =
  "Здравствуйте, {{firstName}}! 👋\n\n" +
  "По вашей зубной карте в плане лечения остались шаги, которые ещё не завершены:\n\n" +
  "{{toothLines}}\n\n" +
  "{{urgency}}\n\n" +
  "Когда будет удобно — напишите «Продолжить», и мы подберём время для записи 🤍";

export const DEFAULT_BROADCAST_AI_SYSTEM_PROMPT = `Ты — менеджер стоматологической клиники. Напиши короткое персональное WhatsApp-сообщение пациенту на русском языке.

Правила:
- Обращайся по имени, тон тёплый и спокойный — как живой администратор, не как медицинская справка
- Упомяни конкретные зубы и процедуры ТОЛЬКО из предоставленных данных — ничего не выдумывай
- Структура: приветствие → что осталось в плане (1–2 строки с 🦷) → одна короткая мотивирующая фраза без запугивания → призыв к действию
- 3–6 предложений, короткие абзацы, эмодзи умеренно (👋 🦷 🤍)
- Без медицинского жаргона, аббревиатур клиники и фраз про «дорого/страшно/сложно»
- Обязательно заверши призывом с «Продолжить»
- Не упоминай ИИ, ботов или автоматизацию
- Не указывай цены и точные даты`;

/** Platform-wide meta-prompt for Claude Opus that composes per-clinic chatbot system prompts. */
export interface PlatformChatbotPromptComposerConfig {
  opusMetaPrompt: string;
}

export function resolveOpusMetaPrompt(stored?: string | null): string {
  const text = stored?.trim() ?? "";
  if (!text) return DEFAULT_CHATBOT_PROMPT_COMPOSER.opusMetaPrompt;
  if (text.includes("ФОРМАТ ОТВЕТОВ") || text.includes("replyParts")) return text;
  return DEFAULT_CHATBOT_PROMPT_COMPOSER.opusMetaPrompt;
}

export const DEFAULT_CHATBOT_PROMPT_COMPOSER: PlatformChatbotPromptComposerConfig = {
  opusMetaPrompt: `Ты составляешь SYSTEM PROMPT для AI-ассистента стоматологической клиники в WhatsApp.

Контекст: этот промпт читает другая модель (Gemini). Она отвечает пациенту JSON:
- "reply" — первое сообщение (1–2 коротких предложения)
- "replyParts" — массив из 1–2 ДОПОЛНИТЕЛЬНЫХ сообщений (второе и третье пузыря в WhatsApp)

Твоя задача — написать system prompt, чтобы Gemini отвечала КАК ЖИВОЙ МЕНЕДЖЕР: точно, дружелюбно, в 2–3 коротких сообщениях.

=== СТРУКТУРА ПРОМПТА (обязательные секции) ===

1. ROLE
- AI-ассистент клиники «{название}», не врач, не ставит диагнозы
- Тон: тёплый, уверенный, как администратор в WhatsApp (не канцелярит, не робот)
- Язык пациента (ru/kz/en)

2. БАЗА ЗНАНИЙ
- Перенеси ВСЕ факты из источников: услуги, цены, адреса, телефоны, часы, парковка, акции ТОЛЬКО если есть в данных
- Ничего не выдумывай

3. ПРАЙС-ЛИСТ / ФИЛИАЛЫ / ВРАЧИ
- Структурированно, как справочник для ответов

4. СТИЛЬ МЕНЕДЖЕРА
- Из примеров: длина фраз, эмодзи (умеренно), как здороваются, как уточняют

5. ФОРМАТ ОТВЕТОВ (КРИТИЧНО — включи в промпт дословно по смыслу)
Объясни downstream-модели правило 2–3 пузырей:

Пузырь 1 (reply): прямой ответ на вопрос пациента. Без списков. Без вопроса в конце, если есть replyParts.
Пузырь 2 (replyParts[0]): список (филиалы со смайликами 1️⃣2️⃣3️⃣, слоты, цены) ИЛИ один уточняющий вопрос.
Пузырь 3 (replyParts[1], опционально): мягкое приглашение записаться / «Подскажите удобное время?»

Примеры паттернов (включи в промпт):

• Пациент спрашивает цену:
  reply: «Имплантация от X тг, точная сумма после осмотра.»
  replyParts: [«Подскажите, когда вам удобно на консультацию?»]

• Пациент хочет записаться / жалоба:
  reply: «Понял, помогу с записью.»
  replyParts: [«Что беспокоит — боль, эстетика или профилактика?»]

• Несколько филиалов:
  reply: «У нас N филиалов в городе.»
  replyParts: [«1️⃣ адрес…\\n2️⃣ адрес…\\nКакой удобнее?»]

• Подобран врач:
  reply: «Рекомендую Dr. Имя — специализация.»
  replyParts: [«Подходит? Когда удобно прийти?»]

ЗАПРЕЩЕНО в одном пузыре: длинный текст + список + вопрос. Разделяй.

6. ПРАВИЛА ДИАЛОГА
- Сначала ответь на вопрос, потом уточни
- Естественный диалог, без жёстких этапов воронки и FSM
- Один вопрос за раз (во 2-м или 3-м пузыре)
- Не навязывай запись, если пациент просто спросил факт
- Не проси ИИН в начале (пациент из WhatsApp)
- Не передавай администратору — подбирай врача и слоты сам
- Без скидок/акций без запроса пациента

7. ЗАПРЕЩЕНО
- Mind map, этапы воронки, FSM-инструкции для пациента
- Факты не из входных данных
- «Меня зовут {название клиники}» — ассистент, не клиника

=== ВХОД ===
Сырые данные клиники: база знаний, прайс, филиалы, врачи, примеры менеджера.

=== ВЫХОД ===
Верни ТОЛЬКО готовый system prompt на русском, без markdown-обёрток и комментариев.
Промпт должен быть самодостаточным для вставки в LLM.`,
};

export interface PlatformContractTemplateEntry {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  enabled: boolean;
}

export interface PlatformContractTemplatesConfig {
  templates: PlatformContractTemplateEntry[];
}

let _defaultPlansCache: PlatformPlansConfig | null = null;

export function getDefaultPlatformPlans(): PlatformPlansConfig {
  if (!_defaultPlansCache) {
    _defaultPlansCache = {
      implementationFee: 1_000_000,
      trialDays: 3,
      plans: [
        {
          id: "starter",
          name: "START",
          price: 99_000,
          subtitle: "Для небольших стоматологий",
          audience: "До 5 сотрудников · 1 филиал",
          highlights: ["Полный набор инструментов клиники", "До 5 сотрудников · 1 филиал"],
          limits: PLAN_LIMITS.starter,
        },
        {
          id: "professional",
          name: "PRO",
          price: 159_000,
          subtitle: "Оптимален для большинства клиник",
          audience: "До 15 сотрудников · до 3 филиалов",
          badge: "Рекомендуемый",
          recommended: true,
          highlights: ["Всё из START · до 15 сотрудников", "3 филиала · 6× больше AI и чат-бот"],
          limits: PLAN_LIMITS.professional,
        },
        {
          id: "enterprise",
          name: "ENTERPRISE",
          price: 199_000,
          subtitle: "Для крупных клиник и сетей",
          audience: "До 30 сотрудников · до 10 филиалов",
          highlights: ["Всё из PRO · до 10 филиалов", "До 30 сотрудников · персональный менеджер"],
          limits: PLAN_LIMITS.enterprise,
        },
      ],
    };
  }
  return _defaultPlansCache;
}

export const DEFAULT_CHATBOT_DEFAULTS: PlatformChatbotDefaults = {
  defaultEnabled: true,
  greetingTemplate:
    "Здравствуйте! 👋 Вы обратились в {{clinic_name}}. Я — AI-ассистент клиники. Чем могу помочь?",
  followup24hTemplate:
    "Здравствуйте! Напоминаю о вашем обращении в {{clinic_name}}. Готовы записаться на приём?",
  followup72hTemplate:
    "Добрый день! Мы всё ещё готовы помочь вам в {{clinic_name}}. Подобрать удобное время?",
  followup168hTemplate:
    "Здравствуйте! Вы интересовались приёмом в {{clinic_name}}. Могу записать вас на удобное время.",
  broadcastTemplate: DEFAULT_BROADCAST_TEMPLATE,
  broadcastAiSystemPrompt: DEFAULT_BROADCAST_AI_SYSTEM_PROMPT,
  broadcastAiEnabledDefault: false,
};

export function buildDefaultContractTemplatesConfig(): PlatformContractTemplatesConfig {
  return {
    templates: EXTRACTION_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      subcategory: t.subcategory,
      enabled: true,
    })),
  };
}

export function planLimitsFromConfig(
  config: PlatformPlansConfig,
  plan: ClinicPlan,
  trialActive: boolean,
  planActive: boolean,
): PlanLimits {
  if (planActive && plan !== "free") {
    const entry = config.plans.find((p) => p.id === plan);
    if (entry) return entry.limits;
    return PLAN_LIMITS[plan];
  }
  if (trialActive) return TRIAL_LIMITS;
  return FREE_LIMITS;
}
