import { randomUUID } from "crypto";
import { db, pool, clinicsTable, aiCreditUsageTable, notificationsTable, usersTable } from "@workspace/db";
import { insertNotification } from "./notifications-dispatch";
import { eq, and, gte, lte, desc, sql, like } from "drizzle-orm";
import type { ClinicPlan } from "@workspace/db";
import { InsufficientAiCreditsError } from "./errors/index";
import { logger } from "../lib/logger";
import {
  FREE_LIMITS,
  PLAN_LIMITS,
  TRIAL_LIMITS,
  normalizeClinicPlan,
  resolveMonthlyAiCreditLimit,
  type ClinicPlanContext,
} from "./plan-limits";

export const PLAN_AI_CREDIT_LIMITS: Record<ClinicPlan, number> = {
  free: FREE_LIMITS.aiCredits,
  starter: PLAN_LIMITS.starter.aiCredits,
  professional: PLAN_LIMITS.professional.aiCredits,
  enterprise: PLAN_LIMITS.enterprise.aiCredits,
};

export const TRIAL_AI_CREDIT_LIMIT = TRIAL_LIMITS.aiCredits;

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
  dental_broadcast: "ИИ-рассылка по зубной карте",
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
  dental_broadcast: 2,
};

let schemaReady: Promise<void> | null = null;

async function ensureAiCreditsSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      try {
        await pool.query(
          `ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "ai_bonus_credits" integer NOT NULL DEFAULT 0`,
        );
        await pool.query(`
          CREATE TABLE IF NOT EXISTS "ai_credit_usage" (
            "id" text PRIMARY KEY NOT NULL,
            "clinic_id" text NOT NULL,
            "user_id" text,
            "feature" text NOT NULL,
            "credits" integer NOT NULL,
            "description" text,
            "created_at" timestamp with time zone DEFAULT now() NOT NULL
          )
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS "ai_credit_usage_clinic_created_idx"
          ON "ai_credit_usage" ("clinic_id", "created_at")
        `);
      } catch (err) {
        schemaReady = null;
        logger.error({ err }, "[AiCredits] Failed to ensure schema");
        throw err;
      }
    })();
  }
  await schemaReady;
}

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
  const context: ClinicPlanContext = { plan, trialEndsAt, planExpiresAt };
  return resolveMonthlyAiCreditLimit(context);
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
    await ensureAiCreditsSchema();

    const { rows } = await pool.query<{
      plan: string;
      trial_ends_at: string | null;
      plan_expires_at: string | null;
      ai_bonus_credits: number | string | null;
    }>(
      `SELECT plan, trial_ends_at, plan_expires_at, COALESCE(ai_bonus_credits, 0) AS ai_bonus_credits
       FROM clinics WHERE id = $1 LIMIT 1`,
      [clinicId],
    );

    const clinic = rows[0];
    if (!clinic) {
      throw new Error("Clinic not found");
    }

    const { start, end } = monthBounds();
    const { rows: usageRows } = await pool.query<{ total: string | number | null }>(
      `SELECT COALESCE(SUM(credits), 0) AS total
       FROM ai_credit_usage
       WHERE clinic_id = $1 AND created_at >= $2 AND created_at <= $3`,
      [clinicId, start.toISOString(), end.toISOString()],
    );

    const plan = normalizeClinicPlan(clinic.plan);
    const trialEndsAt = clinic.trial_ends_at ? new Date(clinic.trial_ends_at) : null;
    const planExpiresAt = clinic.plan_expires_at ? new Date(clinic.plan_expires_at) : null;
    const monthlyLimit = resolveMonthlyLimit(plan, trialEndsAt, planExpiresAt);
    const bonusCredits = Number(clinic.ai_bonus_credits ?? 0);
    const usedThisMonth = Number(usageRows[0]?.total ?? 0);
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
      exhausted: totalAvailable > 0 ? remaining <= 0 : usedThisMonth > 0,
      plan,
      monthLabel,
    };
  }

  async listUsage(clinicId: string, limit = 50): Promise<AiCreditUsageRow[]> {
    await ensureAiCreditsSchema();

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
    await ensureAiCreditsSchema();

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

      await insertNotification({
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
