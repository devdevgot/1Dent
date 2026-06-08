import { randomUUID } from "crypto";
import { db, clinicsTable, aiCreditUsageTable, notificationsTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, desc, sql, like } from "drizzle-orm";
import type { ClinicPlan } from "@workspace/db";
import { InsufficientAiCreditsError } from "./errors/index";

export const PLAN_AI_CREDIT_LIMITS: Record<ClinicPlan, number> = {
  free: 0,
  starter: 1_000,
  professional: 5_000,
  enterprise: 15_000,
};

export const TRIAL_AI_CREDIT_LIMIT = 1_000;

export const AI_CREDIT_FEATURE_LABELS: Record<string, string> = {
  chatbot_reply: "Ответ чат-бота",
  chatbot_classify: "Классификация чат-бота",
  chatbot_test: "Тест чат-бота",
  chatbot_script_parse: "Разбор скрипта чат-бота",
  dental_analysis: "AI-анализ стоматологии",
  tooth_analysis: "AI-анализ зуба",
  contract_ai: "AI-шаблон договора",
  knowledge_parse: "Разбор базы знаний",
  migration_ai: "AI-миграция данных",
  treatment_plan_ai: "AI-план лечения",
  voice_transcribe: "Голосовая транскрипция",
};

export type AiCreditFeature = keyof typeof AI_CREDIT_FEATURE_LABELS;

export const AI_CREDIT_COSTS: Record<AiCreditFeature, number> = {
  chatbot_reply: 1,
  chatbot_classify: 1,
  chatbot_test: 1,
  chatbot_script_parse: 2,
  dental_analysis: 5,
  tooth_analysis: 3,
  contract_ai: 3,
  knowledge_parse: 2,
  migration_ai: 5,
  treatment_plan_ai: 3,
  voice_transcribe: 2,
};

function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function resolveMonthlyLimit(
  plan: ClinicPlan,
  trialEndsAt: Date | null,
  planExpiresAt: Date | null,
): number {
  const now = new Date();
  const trialActive = trialEndsAt != null && trialEndsAt > now;
  const planActive =
    plan !== "free" && (planExpiresAt == null || planExpiresAt > now);

  if (planActive) return PLAN_AI_CREDIT_LIMITS[plan];
  if (trialActive) return TRIAL_AI_CREDIT_LIMIT;
  return PLAN_AI_CREDIT_LIMITS.free;
}

export interface AiCreditsSummary {
  monthlyLimit: number;
  bonusCredits: number;
  totalAvailable: number;
  usedThisMonth: number;
  remaining: number;
  exhausted: boolean;
  plan: ClinicPlan;
  monthLabel: string;
}

export interface AiCreditUsageRow {
  id: string;
  feature: string;
  featureLabel: string;
  credits: number;
  description: string | null;
  userName: string | null;
  createdAt: string;
}

export class AiCreditsService {
  async getSummary(clinicId: string): Promise<AiCreditsSummary> {
    const [clinic] = await db
      .select({
        plan: clinicsTable.plan,
        trialEndsAt: clinicsTable.trialEndsAt,
        planExpiresAt: clinicsTable.planExpiresAt,
        aiBonusCredits: clinicsTable.aiBonusCredits,
      })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1);

    if (!clinic) {
      throw new Error("Clinic not found");
    }

    const { start, end } = monthBounds();
    const [usageRow] = await db
      .select({
        total: sql<number>`coalesce(sum(${aiCreditUsageTable.credits}), 0)`.mapWith(Number),
      })
      .from(aiCreditUsageTable)
      .where(
        and(
          eq(aiCreditUsageTable.clinicId, clinicId),
          gte(aiCreditUsageTable.createdAt, start),
          lte(aiCreditUsageTable.createdAt, end),
        ),
      );

    const monthlyLimit = resolveMonthlyLimit(
      clinic.plan,
      clinic.trialEndsAt,
      clinic.planExpiresAt,
    );
    const bonusCredits = clinic.aiBonusCredits ?? 0;
    const usedThisMonth = usageRow?.total ?? 0;
    const totalAvailable = monthlyLimit + bonusCredits;
    const remaining = Math.max(0, totalAvailable - usedThisMonth);

    const now = new Date();
    const monthLabel = now.toLocaleDateString("ru", { month: "long", year: "numeric" });

    return {
      monthlyLimit,
      bonusCredits,
      totalAvailable,
      usedThisMonth,
      remaining,
      exhausted: remaining <= 0,
      plan: clinic.plan,
      monthLabel,
    };
  }

  async listUsage(clinicId: string, limit = 50): Promise<AiCreditUsageRow[]> {
    const rows = await db
      .select({
        id: aiCreditUsageTable.id,
        feature: aiCreditUsageTable.feature,
        credits: aiCreditUsageTable.credits,
        description: aiCreditUsageTable.description,
        createdAt: aiCreditUsageTable.createdAt,
        userName: usersTable.name,
      })
      .from(aiCreditUsageTable)
      .leftJoin(usersTable, eq(aiCreditUsageTable.userId, usersTable.id))
      .where(eq(aiCreditUsageTable.clinicId, clinicId))
      .orderBy(desc(aiCreditUsageTable.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      feature: row.feature,
      featureLabel: AI_CREDIT_FEATURE_LABELS[row.feature] ?? row.feature,
      credits: row.credits,
      description: row.description,
      userName: row.userName,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async consumeCredits(params: {
    clinicId: string;
    userId?: string | null;
    feature: AiCreditFeature;
    description?: string;
    credits?: number;
  }): Promise<void> {
    const cost = params.credits ?? AI_CREDIT_COSTS[params.feature] ?? 1;
    const summary = await this.getSummary(params.clinicId);

    if (summary.remaining < cost) {
      await this.notifyExhausted(params.clinicId);
      throw new InsufficientAiCreditsError();
    }

    await db.insert(aiCreditUsageTable).values({
      id: randomUUID(),
      clinicId: params.clinicId,
      userId: params.userId ?? null,
      feature: params.feature,
      credits: cost,
      description: params.description ?? AI_CREDIT_FEATURE_LABELS[params.feature],
    });

    const after = summary.remaining - cost;
    if (after <= 0) {
      await this.notifyExhausted(params.clinicId);
    }
  }

  private async notifyExhausted(clinicId: string): Promise<void> {
    const owners = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.clinicId, clinicId), eq(usersTable.role, "owner")));

    const message =
      "AI-кредиты закончились. Докупите дополнительные кредиты или перейдите на тариф с большим лимитом.";

    for (const owner of owners) {
      const [existing] = await db
        .select({ id: notificationsTable.id })
        .from(notificationsTable)
        .where(
          and(
            eq(notificationsTable.clinicId, clinicId),
            eq(notificationsTable.userId, owner.id),
            eq(notificationsTable.type, "system"),
            eq(notificationsTable.read, false),
            like(notificationsTable.message, "%AI-кредиты закончились%"),
          ),
        )
        .limit(1);

      if (existing) continue;

      await db.insert(notificationsTable).values({
        id: randomUUID(),
        clinicId,
        userId: owner.id,
        type: "system",
        message,
        read: false,
        payload: { kind: "ai_credits_exhausted" },
      });
    }
  }
}

export const aiCreditsService = new AiCreditsService();
