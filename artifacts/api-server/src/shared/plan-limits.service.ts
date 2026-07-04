import { db, pool, usersTable, contractTemplatesTable, clinicsTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  type ClinicPlanContext,
  type PlanLimitKey,
  PLAN_LIMIT_LABELS,
  resolvePlanLimits,
  normalizeClinicPlan,
} from "./plan-limits";
import { PlanLimitExceededError } from "./errors";

function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export class PlanLimitsService {
  async getClinicContext(clinicId: string): Promise<ClinicPlanContext> {
    const [clinic] = await db
      .select({
        plan: clinicsTable.plan,
        trialEndsAt: clinicsTable.trialEndsAt,
        planExpiresAt: clinicsTable.planExpiresAt,
        parentClinicId: clinicsTable.parentClinicId,
      })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1);

    if (!clinic) {
      throw new Error("Clinic not found");
    }

    return {
      plan: normalizeClinicPlan(clinic.plan),
      trialEndsAt: clinic.trialEndsAt,
      planExpiresAt: clinic.planExpiresAt,
    };
  }

  async resolveHomeClinicId(clinicId: string): Promise<string> {
    const [clinic] = await db
      .select({ id: clinicsTable.id, parentClinicId: clinicsTable.parentClinicId })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1);

    if (!clinic) throw new Error("Clinic not found");
    return clinic.parentClinicId ?? clinic.id;
  }

  async getOrgClinicIds(homeClinicId: string): Promise<string[]> {
    const children = await db
      .select({ id: clinicsTable.id })
      .from(clinicsTable)
      .where(eq(clinicsTable.parentClinicId, homeClinicId));

    return [homeClinicId, ...children.map((row) => row.id)];
  }

  async getLimitsForClinic(clinicId: string) {
    const homeClinicId = await this.resolveHomeClinicId(clinicId);
    const context = await this.getClinicContext(homeClinicId);
    return {
      homeClinicId,
      context,
      limits: resolvePlanLimits(context),
    };
  }

  async countActiveStaff(homeClinicId: string): Promise<number> {
    const clinicIds = await this.getOrgClinicIds(homeClinicId);
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(
        and(
          inArray(usersTable.clinicId, clinicIds),
          sql`COALESCE(${usersTable.isActive}, true) = true`,
        ),
      );
    return Number(row?.count ?? 0);
  }

  async countBranches(homeClinicId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clinicsTable)
      .where(eq(clinicsTable.parentClinicId, homeClinicId));
    return 1 + Number(row?.count ?? 0);
  }

  async countCustomTemplates(clinicId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contractTemplatesTable)
      .where(
        and(
          eq(contractTemplatesTable.clinicId, clinicId),
          eq(contractTemplatesTable.isSystem, false),
        ),
      );
    return Number(row?.count ?? 0);
  }

  async countChatbotDialogsThisMonth(clinicId: string): Promise<number> {
    const { start, end } = monthBounds();
    const { rows } = await pool.query<{ count: string | number }>(
      `SELECT COUNT(DISTINCT phone)::int AS count
       FROM chatbot_messages
       WHERE clinic_id = $1
         AND direction = 'outbound'
         AND created_at >= $2
         AND created_at <= $3`,
      [clinicId, start.toISOString(), end.toISOString()],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async phoneHasChatbotDialogThisMonth(clinicId: string, phone: string): Promise<boolean> {
    const { start, end } = monthBounds();
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM chatbot_messages
         WHERE clinic_id = $1
           AND phone = $2
           AND direction = 'outbound'
           AND created_at >= $3
           AND created_at <= $4
       ) AS exists`,
      [clinicId, phone, start.toISOString(), end.toISOString()],
    );
    return Boolean(rows[0]?.exists);
  }

  private throwIfExceeded(key: PlanLimitKey, limit: number | null, used: number): void {
    if (limit == null) return;
    if (used >= limit) {
      throw new PlanLimitExceededError(key, limit);
    }
  }

  async assertCanAddStaff(clinicId: string): Promise<void> {
    const { homeClinicId, limits } = await this.getLimitsForClinic(clinicId);
    const used = await this.countActiveStaff(homeClinicId);
    this.throwIfExceeded("staff", limits.staff, used);
  }

  async assertCanAddBranch(clinicId: string): Promise<void> {
    const { homeClinicId, limits } = await this.getLimitsForClinic(clinicId);
    const used = await this.countBranches(homeClinicId);
    this.throwIfExceeded("branches", limits.branches, used);
  }

  async assertCanAddTemplate(clinicId: string): Promise<void> {
    const { limits } = await this.getLimitsForClinic(clinicId);
    const used = await this.countCustomTemplates(clinicId);
    this.throwIfExceeded("documentTemplates", limits.documentTemplates, used);
  }

  async assertCanStartChatbotDialog(clinicId: string, phone: string): Promise<void> {
    const { limits } = await this.getLimitsForClinic(clinicId);
    if (limits.chatbotDialogs <= 0) {
      throw new PlanLimitExceededError("chatbotDialogs", limits.chatbotDialogs);
    }

    const alreadyCounted = await this.phoneHasChatbotDialogThisMonth(clinicId, phone);
    if (alreadyCounted) return;

    const used = await this.countChatbotDialogsThisMonth(clinicId);
    this.throwIfExceeded("chatbotDialogs", limits.chatbotDialogs, used);
  }

  async getUsageSummary(clinicId: string) {
    const { homeClinicId, limits, context } = await this.getLimitsForClinic(clinicId);
    const [staff, branches, templates, chatbotDialogs] = await Promise.all([
      this.countActiveStaff(homeClinicId),
      this.countBranches(homeClinicId),
      this.countCustomTemplates(clinicId),
      this.countChatbotDialogsThisMonth(clinicId),
    ]);

    return {
      plan: context.plan,
      limits,
      usage: {
        staff,
        branches,
        documentTemplates: templates,
        chatbotDialogs,
      },
      labels: PLAN_LIMIT_LABELS,
    };
  }
}

export const planLimitsService = new PlanLimitsService();
