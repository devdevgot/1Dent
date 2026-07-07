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
}

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
