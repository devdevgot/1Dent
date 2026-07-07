import type { ClinicPlan } from "@workspace/db";
import { planLimitsFromConfig } from "../modules/platform-config/platform-config.defaults";
import { getCachedPlansConfig } from "../modules/platform-config/platform-config.service";

export type PlanLimitKey = "staff" | "branches" | "aiCredits" | "chatbotDialogs" | "documentTemplates";

export interface PlanLimits {
  staff: number;
  branches: number;
  aiCredits: number;
  chatbotDialogs: number;
  /** `null` = без лимита */
  documentTemplates: number | null;
}

export const TRIAL_LIMITS: PlanLimits = {
  staff: 2,
  branches: 1,
  aiCredits: 50,
  chatbotDialogs: 20,
  documentTemplates: 1,
};

export const FREE_LIMITS: PlanLimits = {
  staff: 1,
  branches: 1,
  aiCredits: 0,
  chatbotDialogs: 0,
  documentTemplates: 0,
};

export const PLAN_LIMITS: Record<Exclude<ClinicPlan, "free">, PlanLimits> = {
  starter: {
    staff: 5,
    branches: 1,
    aiCredits: 500,
    chatbotDialogs: 100,
    documentTemplates: 5,
  },
  professional: {
    staff: 15,
    branches: 3,
    aiCredits: 3_000,
    chatbotDialogs: 1_000,
    documentTemplates: 30,
  },
  enterprise: {
    staff: 30,
    branches: 10,
    aiCredits: 7_000,
    chatbotDialogs: 5_000,
    documentTemplates: null,
  },
};

export const PLAN_LIMIT_LABELS: Record<PlanLimitKey, string> = {
  staff: "сотрудников",
  branches: "филиалов",
  aiCredits: "AI-кредитов",
  chatbotDialogs: "диалогов чат-бота",
  documentTemplates: "шаблонов договоров",
};

export interface ClinicPlanContext {
  plan: ClinicPlan;
  trialEndsAt: Date | null;
  planExpiresAt: Date | null;
}

export function normalizeClinicPlan(plan: string | null | undefined): ClinicPlan {
  if (plan === "starter" || plan === "professional" || plan === "enterprise") {
    return plan;
  }
  return "free";
}

export function isTrialActive(trialEndsAt: Date | null, now = new Date()): boolean {
  return trialEndsAt != null && trialEndsAt > now;
}

export function isPaidPlanActive(
  plan: ClinicPlan,
  planExpiresAt: Date | null,
  now = new Date(),
): boolean {
  return plan !== "free" && (planExpiresAt == null || planExpiresAt > now);
}

export function resolvePlanLimits(
  context: ClinicPlanContext,
  now = new Date(),
): PlanLimits {
  const plan = normalizeClinicPlan(context.plan);
  const trialActive = isTrialActive(context.trialEndsAt, now);
  const planActive = isPaidPlanActive(plan, context.planExpiresAt, now);

  return planLimitsFromConfig(getCachedPlansConfig(), plan, trialActive, planActive);
}

export function resolveMonthlyAiCreditLimit(
  context: ClinicPlanContext,
  now = new Date(),
): number {
  return resolvePlanLimits(context, now).aiCredits;
}

export function formatPlanLimitValue(key: PlanLimitKey, value: number | null): string {
  if (key === "documentTemplates" && value == null) return "без лимита";
  return String(value);
}
