/**
 * Customer Care Chatbot
 * ---------------------
 * Second logical bot on the **same** clinic WhatsApp (Green API) number.
 * When the patient agrees to book after a Care message → handoffToBooking=true.
 * The MAIN booking chatbot then picks doctor, slots, and creates the procedure.
 * Care never inserts into `procedures` itself.
 */

import { randomUUID } from "crypto";
import { and, eq, inArray, lte, ne, gte, isNotNull } from "drizzle-orm";
import {
  db,
  customerCareSettingsTable,
  customerCareJobsTable,
  chatbotSettingsTable,
  chatbotSessionsTable,
  clinicsTable,
  patientsTable,
  proceduresTable,
  usersTable,
  type CustomerCarePromptPack,
} from "@workspace/db";
import { logger } from "../../lib/logger";
import { sendToPatient } from "../../shared/messaging";
import { withProactiveSendClaim } from "../../shared/conversation-gate";
import { getRedisClient } from "../../shared/redis";
import { canonicalChatbotPhone } from "../chatbot/chatbot-phone";
import { customerCareTemplates } from "./customer-care-templates";
import { mergeCarePrompts } from "./customer-care-prompts";
import {
  DEFAULT_CUSTOMER_CARE_SETTINGS,
  type CustomerCareClinicSettings,
  type CustomerCareJob,
  type CustomerCareJobType,
  type CustomerCareReplyIntent,
  type CustomerCareReplyResult,
} from "./customer-care-chatbot.types";

const CARE_CONTEXT_TTL_MS = 48 * 60 * 60 * 1000;
const LEAD_NURTURE_STATES = [
  "greeting",
  "collect_name",
  "collect_problem",
  "collect_qualification",
  "suggest_doctor",
  "await_decision",
  "collect_datetime",
  "collect_branch",
  "handle_objections",
] as const;

function careContextKey(clinicId: string, phone: string): string {
  return `care:ctx:${clinicId}:${canonicalChatbotPhone(phone)}`;
}

function rowToSettings(row: typeof customerCareSettingsTable.$inferSelect): CustomerCareClinicSettings {
  const delays = row.leadNurtureDelaysMinutes;
  return {
    enabled: row.enabled,
    leadNurtureEnabled: row.leadNurtureEnabled,
    leadNurtureDelaysMinutes: [
      delays?.[0] ?? 25,
      delays?.[1] ?? 150,
      delays?.[2] ?? 1440,
    ],
    reminder1hEnabled: row.reminder1hEnabled,
    reminder24hEnabled: row.reminder24hEnabled,
    noShowEnabled: row.noShowEnabled,
    noShowGraceHours: row.noShowGraceHours ?? 2,
    postVisitEnabled: row.postVisitEnabled,
    upsellEnabled: row.upsellEnabled,
    bookingMode: "handoff_to_booking",
    prompts: mergeCarePrompts(row.prompts as Partial<CustomerCarePromptPack> | null),
  };
}

async function isChatbotEnabled(clinicId: string): Promise<boolean> {
  const [row] = await db
    .select({ enabled: chatbotSettingsTable.enabled })
    .from(chatbotSettingsTable)
    .where(eq(chatbotSettingsTable.clinicId, clinicId))
    .limit(1);
  return row?.enabled === true;
}

/** Direct table sync — no service import cycle from chatbot.service. */
export async function syncCustomerCareEnabledFlag(
  clinicId: string,
  chatbotEnabled: boolean,
): Promise<void> {
  const [existing] = await db
    .select({ id: customerCareSettingsTable.id, enabled: customerCareSettingsTable.enabled })
    .from(customerCareSettingsTable)
    .where(eq(customerCareSettingsTable.clinicId, clinicId))
    .limit(1);

  if (existing) {
    if (existing.enabled === chatbotEnabled) return;
    await db
      .update(customerCareSettingsTable)
      .set({ enabled: chatbotEnabled, updatedAt: new Date() })
      .where(eq(customerCareSettingsTable.clinicId, clinicId));
  } else {
    await db.insert(customerCareSettingsTable).values({
      id: randomUUID(),
      clinicId,
      enabled: chatbotEnabled,
      prompts: mergeCarePrompts(null),
    });
  }
  logger.info(
    { clinicId, chatbotEnabled },
    "[CustomerCare] Synced enabled flag with main chatbot (direct update)",
  );
}

export class CustomerCareChatbotService {
  async syncEnabledWithChatbot(clinicId: string, chatbotEnabled: boolean): Promise<CustomerCareClinicSettings> {
    await syncCustomerCareEnabledFlag(clinicId, chatbotEnabled);
    return this.getSettingsRaw(clinicId);
  }

  private async getSettingsRaw(clinicId: string): Promise<CustomerCareClinicSettings> {
    const [row] = await db
      .select()
      .from(customerCareSettingsTable)
      .where(eq(customerCareSettingsTable.clinicId, clinicId))
      .limit(1);
    if (!row) {
      return { ...DEFAULT_CUSTOMER_CARE_SETTINGS, prompts: mergeCarePrompts(null) };
    }
    return rowToSettings(row);
  }

  async getSettings(clinicId: string): Promise<CustomerCareClinicSettings> {
    const chatbotOn = await isChatbotEnabled(clinicId);
    const current = await this.getSettingsRaw(clinicId);
    if (current.enabled !== chatbotOn) {
      return this.syncEnabledWithChatbot(clinicId, chatbotOn);
    }
    return current;
  }

  async updateSettings(
    clinicId: string,
    patch: Partial<CustomerCareClinicSettings>,
  ): Promise<CustomerCareClinicSettings> {
    const chatbotOn = await isChatbotEnabled(clinicId);
    const current = await this.getSettingsRaw(clinicId);
    const next: CustomerCareClinicSettings = {
      ...current,
      ...patch,
      enabled: chatbotOn,
      bookingMode: "handoff_to_booking",
      leadNurtureDelaysMinutes: patch.leadNurtureDelaysMinutes ?? current.leadNurtureDelaysMinutes,
      prompts: mergeCarePrompts({ ...current.prompts, ...(patch.prompts ?? {}) }),
    };
    return this.persistSettings(clinicId, next);
  }

  private async persistSettings(
    clinicId: string,
    next: CustomerCareClinicSettings,
  ): Promise<CustomerCareClinicSettings> {
    const [existing] = await db
      .select({ id: customerCareSettingsTable.id })
      .from(customerCareSettingsTable)
      .where(eq(customerCareSettingsTable.clinicId, clinicId))
      .limit(1);

    if (existing) {
      await db
        .update(customerCareSettingsTable)
        .set({
          enabled: next.enabled,
          leadNurtureEnabled: next.leadNurtureEnabled,
          leadNurtureDelaysMinutes: next.leadNurtureDelaysMinutes,
          reminder1hEnabled: next.reminder1hEnabled,
          reminder24hEnabled: next.reminder24hEnabled,
          noShowEnabled: next.noShowEnabled,
          noShowGraceHours: next.noShowGraceHours,
          postVisitEnabled: next.postVisitEnabled,
          upsellEnabled: next.upsellEnabled,
          bookingMode: next.bookingMode,
          prompts: next.prompts,
          updatedAt: new Date(),
        })
        .where(eq(customerCareSettingsTable.clinicId, clinicId));
    } else {
      await db.insert(customerCareSettingsTable).values({
        id: randomUUID(),
        clinicId,
        enabled: next.enabled,
        leadNurtureEnabled: next.leadNurtureEnabled,
        leadNurtureDelaysMinutes: next.leadNurtureDelaysMinutes,
        reminder1hEnabled: next.reminder1hEnabled,
        reminder24hEnabled: next.reminder24hEnabled,
        noShowEnabled: next.noShowEnabled,
        noShowGraceHours: next.noShowGraceHours,
        postVisitEnabled: next.postVisitEnabled,
        upsellEnabled: next.upsellEnabled,
        bookingMode: next.bookingMode,
        prompts: next.prompts,
      });
    }

    return next;
  }

  /** True when Care recently messaged this phone and still owns the thread. */
  async hasActiveCareContext(clinicId: string, phone: string): Promise<boolean> {
    const normalized = canonicalChatbotPhone(phone);
    const redis = getRedisClient();
    if (redis) {
      const hit = await redis.get(careContextKey(clinicId, normalized)).catch(() => null);
      if (hit) return true;
    }

    const since = new Date(Date.now() - CARE_CONTEXT_TTL_MS);
    const [row] = await db
      .select({ id: customerCareJobsTable.id })
      .from(customerCareJobsTable)
      .where(
        and(
          eq(customerCareJobsTable.clinicId, clinicId),
          eq(customerCareJobsTable.phone, normalized),
          inArray(customerCareJobsTable.status, ["sent", "replied"]),
          gte(customerCareJobsTable.sentAt, since),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  private async markCareContext(clinicId: string, phone: string): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;
    await redis
      .set(careContextKey(clinicId, phone), "1", "PX", CARE_CONTEXT_TTL_MS)
      .catch((err) => logger.warn({ err }, "[CustomerCare] markCareContext failed"));
  }

  private async enqueueJob(job: {
    clinicId: string;
    phone: string;
    patientId?: string | null;
    type: CustomerCareJobType;
    step: number;
    sendAt: Date;
    procedureId?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<boolean> {
    const phone = canonicalChatbotPhone(job.phone);
    try {
      await db.insert(customerCareJobsTable).values({
        id: randomUUID(),
        clinicId: job.clinicId,
        patientId: job.patientId ?? null,
        phone,
        type: job.type,
        status: "pending",
        step: job.step,
        sendAt: job.sendAt,
        procedureId: job.procedureId ?? null,
        payload: job.payload ?? {},
      });
      return true;
    } catch (err) {
      // Unique dedupe index — already enqueued.
      const msg = err instanceof Error ? err.message : String(err);
      if (/unique|duplicate/i.test(msg)) return false;
      logger.warn({ err, type: job.type, clinicId: job.clinicId }, "[CustomerCare] enqueueJob failed");
      return false;
    }
  }

  async scheduleLeadNurture(params: {
    clinicId: string;
    phone: string;
    patientId?: string | null;
  }): Promise<void> {
    const settings = await this.getSettings(params.clinicId);
    if (!settings.enabled || !settings.leadNurtureEnabled) return;
    const now = Date.now();
    for (let step = 1; step <= 3; step++) {
      const delayMin = settings.leadNurtureDelaysMinutes[step - 1] ?? 25;
      await this.enqueueJob({
        clinicId: params.clinicId,
        phone: params.phone,
        patientId: params.patientId,
        type: "lead_nurture",
        step,
        sendAt: new Date(now + delayMin * 60_000),
      });
    }
    logger.info(
      { clinicId: params.clinicId, phone: params.phone },
      "[CustomerCare] scheduleLeadNurture enqueued",
    );
  }

  async scheduleVisitReminders(params: {
    clinicId: string;
    patientId: string;
    phone: string;
    procedureId: string;
    scheduledAt: Date;
    clinicName?: string;
    doctorName?: string;
    patientName?: string;
  }): Promise<void> {
    const settings = await this.getSettings(params.clinicId);
    if (!settings.enabled) return;
    const payload = {
      clinicName: params.clinicName ?? "",
      doctorName: params.doctorName ?? "",
      patientName: params.patientName ?? "",
      scheduledAt: params.scheduledAt.toISOString(),
    };
    if (settings.reminder24hEnabled) {
      await this.enqueueJob({
        clinicId: params.clinicId,
        phone: params.phone,
        patientId: params.patientId,
        type: "reminder_24h",
        step: 1,
        sendAt: new Date(params.scheduledAt.getTime() - 24 * 60 * 60_000),
        procedureId: params.procedureId,
        payload,
      });
    }
    if (settings.reminder1hEnabled) {
      await this.enqueueJob({
        clinicId: params.clinicId,
        phone: params.phone,
        patientId: params.patientId,
        type: "reminder_1h",
        step: 1,
        sendAt: new Date(params.scheduledAt.getTime() - 60 * 60_000),
        procedureId: params.procedureId,
        payload,
      });
    }
    if (settings.noShowEnabled) {
      await this.enqueueJob({
        clinicId: params.clinicId,
        phone: params.phone,
        patientId: params.patientId,
        type: "no_show",
        step: 1,
        sendAt: new Date(
          params.scheduledAt.getTime() + settings.noShowGraceHours * 60 * 60_000,
        ),
        procedureId: params.procedureId,
        payload,
      });
    }
    logger.info(
      { clinicId: params.clinicId, procedureId: params.procedureId },
      "[CustomerCare] scheduleVisitReminders enqueued",
    );
  }

  async scheduleNoShowFollowup(params: {
    clinicId: string;
    patientId: string;
    phone: string;
    procedureId: string;
    scheduledAt: Date;
  }): Promise<void> {
    const settings = await this.getSettings(params.clinicId);
    if (!settings.enabled || !settings.noShowEnabled) return;
    await this.enqueueJob({
      clinicId: params.clinicId,
      phone: params.phone,
      patientId: params.patientId,
      type: "no_show",
      step: 1,
      sendAt: new Date(params.scheduledAt.getTime() + settings.noShowGraceHours * 60 * 60_000),
      procedureId: params.procedureId,
    });
  }

  async schedulePostVisitCare(params: {
    clinicId: string;
    patientId: string;
    phone: string;
    procedureId: string;
  }): Promise<void> {
    const settings = await this.getSettings(params.clinicId);
    if (!settings.enabled || !settings.postVisitEnabled) return;
    const now = Date.now();
    await this.enqueueJob({
      clinicId: params.clinicId,
      phone: params.phone,
      patientId: params.patientId,
      type: "post_visit",
      step: 1,
      sendAt: new Date(now + 2 * 60 * 60_000),
      procedureId: params.procedureId,
    });
    await this.enqueueJob({
      clinicId: params.clinicId,
      phone: params.phone,
      patientId: params.patientId,
      type: "post_visit",
      step: 2,
      sendAt: new Date(now + 48 * 60 * 60_000),
      procedureId: params.procedureId,
    });
    if (settings.upsellEnabled) {
      await this.enqueueJob({
        clinicId: params.clinicId,
        phone: params.phone,
        patientId: params.patientId,
        type: "upsell",
        step: 1,
        sendAt: new Date(now + 72 * 60 * 60_000),
        procedureId: params.procedureId,
      });
    }
    logger.info(
      { clinicId: params.clinicId, procedureId: params.procedureId },
      "[CustomerCare] schedulePostVisitCare enqueued",
    );
  }

  async scheduleUpsell(params: {
    clinicId: string;
    patientId: string;
    phone: string;
    procedureId?: string | null;
  }): Promise<void> {
    const settings = await this.getSettings(params.clinicId);
    if (!settings.enabled || !settings.upsellEnabled) return;
    await this.enqueueJob({
      clinicId: params.clinicId,
      phone: params.phone,
      patientId: params.patientId,
      type: "upsell",
      step: 1,
      sendAt: new Date(Date.now() + 72 * 60 * 60_000),
      procedureId: params.procedureId,
    });
  }

  /**
   * Reply while Care owns the thread.
   * want_booking / reschedule → handoffToBooking so main chatbot records the visit.
   */
  async processReply(
    clinicId: string,
    phone: string,
    text: string,
  ): Promise<CustomerCareReplyResult> {
    const intent = this.classifyReplyIntent(text);
    const settings = await this.getSettings(clinicId);
    if (!settings.enabled) {
      return { handled: false, handoffToBooking: false, intent };
    }
    logger.info({ clinicId, phone, intent }, "[CustomerCare] processReply");

    if (intent === "complaint") {
      return { handled: true, handoffToBooking: false, intent };
    }

    if (intent === "want_booking" || intent === "reschedule") {
      const handoffText = fillHandoff(settings.prompts.handoffToBookingPrompt);
      await this.sendCareMessage(clinicId, phone, handoffText);
      logger.info(
        { clinicId, phone, bookingMode: settings.bookingMode },
        "[CustomerCare] Handoff to main booking chatbot",
      );
      return { handled: true, handoffToBooking: true, intent };
    }

    if (intent === "confirm_visit" || intent === "thanks_ok") {
      const reply =
        intent === "confirm_visit"
          ? "Спасибо, ждём вас! 👍"
          : "Рады, что всё хорошо 😊 Если понадобится помощь — мы на связи.";
      await this.sendCareMessage(clinicId, phone, reply);
      return { handled: true, handoffToBooking: false, intent };
    }

    await this.sendCareMessage(
      clinicId,
      phone,
      "Напишите, пожалуйста: подтвердить визит, перенести, или записаться снова — помогу 😊",
    );
    return { handled: true, handoffToBooking: false, intent: "unknown" };
  }

  async sendCareMessage(clinicId: string, phone: string, content: string): Promise<string | null> {
    const sent = await withProactiveSendClaim(clinicId, phone, "care", async () => {
      await assertGreenApiConfigured(clinicId, "care");
      return sendToPatient(clinicId, phone, content);
    });
    if (sent !== null) {
      await this.markCareContext(clinicId, phone);
    }
    return sent;
  }

  renderTemplate(
    type: CustomerCareJobType,
    step: number,
    vars: {
      clinicName?: string;
      patientName?: string;
      time?: string;
      date?: string;
      doctorName?: string;
    },
    prompts?: CustomerCarePromptPack,
  ): string {
    const pack = prompts ?? DEFAULT_CUSTOMER_CARE_SETTINGS.prompts;
    switch (type) {
      case "lead_nurture":
        return customerCareTemplates.leadNurture(step, vars, pack);
      case "reminder_24h":
        return customerCareTemplates.reminder24h(vars, pack);
      case "reminder_1h":
        return customerCareTemplates.reminder1h(vars, pack);
      case "no_show":
        return customerCareTemplates.noShow(vars, pack);
      case "post_visit":
        return customerCareTemplates.postVisit(step, vars, pack);
      case "upsell":
        return customerCareTemplates.upsell(vars, pack);
      default:
        return "";
    }
  }

  /** Discover + send due Care jobs. Called by scheduler tick. */
  async processDueJobs(): Promise<number> {
    await this.discoverLeadNurtureJobs().catch((err) =>
      logger.warn({ err }, "[CustomerCare] discoverLeadNurtureJobs failed"),
    );
    await this.discoverCompletedVisitJobs().catch((err) =>
      logger.warn({ err }, "[CustomerCare] discoverCompletedVisitJobs failed"),
    );

    const now = new Date();
    const due = await db
      .select()
      .from(customerCareJobsTable)
      .where(
        and(eq(customerCareJobsTable.status, "pending"), lte(customerCareJobsTable.sendAt, now)),
      )
      .limit(100);

    let sentCount = 0;
    for (const job of due) {
      try {
        const ok = await this.sendDueJob(job);
        if (ok) sentCount++;
      } catch (err) {
        logger.warn({ err, jobId: job.id }, "[CustomerCare] sendDueJob failed");
        await db
          .update(customerCareJobsTable)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(customerCareJobsTable.id, job.id))
          .catch(() => {});
      }
    }
    return sentCount;
  }

  private async discoverLeadNurtureJobs(): Promise<void> {
    const sessions = await db
      .select({
        id: chatbotSessionsTable.id,
        clinicId: chatbotSessionsTable.clinicId,
        phone: chatbotSessionsTable.phone,
        state: chatbotSessionsTable.state,
        updatedAt: chatbotSessionsTable.updatedAt,
        humanTakeover: chatbotSessionsTable.humanTakeover,
        data: chatbotSessionsTable.data,
      })
      .from(chatbotSessionsTable)
      .where(
        and(
          ne(chatbotSessionsTable.state, "done"),
          ne(chatbotSessionsTable.state, "human_takeover"),
          eq(chatbotSessionsTable.humanTakeover, false),
        ),
      )
      .limit(200);

    for (const session of sessions) {
      if (!(LEAD_NURTURE_STATES as readonly string[]).includes(session.state)) continue;
      const settings = await this.getSettings(session.clinicId);
      if (!settings.enabled || !settings.leadNurtureEnabled) continue;

      const data = (session.data ?? {}) as { decisionOutcome?: string; existingPatientId?: string };
      if (data.decisionOutcome === "refused") continue;

      // Only enqueue if no nurture jobs yet for this phone.
      const [existing] = await db
        .select({ id: customerCareJobsTable.id })
        .from(customerCareJobsTable)
        .where(
          and(
            eq(customerCareJobsTable.clinicId, session.clinicId),
            eq(customerCareJobsTable.phone, canonicalChatbotPhone(session.phone)),
            eq(customerCareJobsTable.type, "lead_nurture"),
          ),
        )
        .limit(1);
      if (existing) continue;

      // Anchor from last session update — first delay from now if already idle.
      const idleMs = Date.now() - new Date(session.updatedAt).getTime();
      if (idleMs < (settings.leadNurtureDelaysMinutes[0] ?? 25) * 60_000) continue;

      await this.scheduleLeadNurture({
        clinicId: session.clinicId,
        phone: session.phone,
        patientId: data.existingPatientId ?? null,
      });
    }
  }

  private async discoverCompletedVisitJobs(): Promise<void> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const completed = await db
      .select({
        id: proceduresTable.id,
        clinicId: proceduresTable.clinicId,
        patientId: proceduresTable.patientId,
        completedAt: proceduresTable.completedAt,
        doctorId: proceduresTable.doctorId,
      })
      .from(proceduresTable)
      .where(
        and(
          eq(proceduresTable.status, "completed"),
          isNotNull(proceduresTable.completedAt),
          gte(proceduresTable.completedAt, since),
        ),
      )
      .limit(100);

    for (const proc of completed) {
      if (!proc.patientId || !proc.completedAt) continue;
      const settings = await this.getSettings(proc.clinicId);
      if (!settings.enabled || !settings.postVisitEnabled) continue;

      const [existing] = await db
        .select({ id: customerCareJobsTable.id })
        .from(customerCareJobsTable)
        .where(
          and(
            eq(customerCareJobsTable.procedureId, proc.id),
            eq(customerCareJobsTable.type, "post_visit"),
          ),
        )
        .limit(1);
      if (existing) continue;

      const [patient] = await db
        .select({ phone: patientsTable.phone })
        .from(patientsTable)
        .where(eq(patientsTable.id, proc.patientId))
        .limit(1);
      if (!patient?.phone) continue;

      await this.schedulePostVisitCare({
        clinicId: proc.clinicId,
        patientId: proc.patientId,
        phone: patient.phone,
        procedureId: proc.id,
      });
    }
  }

  private async sendDueJob(job: typeof customerCareJobsTable.$inferSelect): Promise<boolean> {
    const settings = await this.getSettings(job.clinicId);
    if (!settings.enabled) {
      await db
        .update(customerCareJobsTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(customerCareJobsTable.id, job.id));
      return false;
    }

    // Skip no-show if visit was completed / cancelled.
    if (job.type === "no_show" && job.procedureId) {
      const [proc] = await db
        .select({ status: proceduresTable.status })
        .from(proceduresTable)
        .where(eq(proceduresTable.id, job.procedureId))
        .limit(1);
      if (proc && proc.status !== "scheduled") {
        await db
          .update(customerCareJobsTable)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(customerCareJobsTable.id, job.id));
        return false;
      }
    }

    // Skip visit reminders if appointment was moved / cancelled.
    if ((job.type === "reminder_1h" || job.type === "reminder_24h") && job.procedureId) {
      const [proc] = await db
        .select({ status: proceduresTable.status, scheduledAt: proceduresTable.scheduledAt })
        .from(proceduresTable)
        .where(eq(proceduresTable.id, job.procedureId))
        .limit(1);
      if (!proc || proc.status !== "scheduled") {
        await db
          .update(customerCareJobsTable)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(customerCareJobsTable.id, job.id));
        return false;
      }
    }

    if (job.type === "lead_nurture" && !settings.leadNurtureEnabled) {
      await cancelJob(job.id);
      return false;
    }
    if (job.type === "reminder_24h" && !settings.reminder24hEnabled) {
      await cancelJob(job.id);
      return false;
    }
    if (job.type === "reminder_1h" && !settings.reminder1hEnabled) {
      await cancelJob(job.id);
      return false;
    }
    if (job.type === "no_show" && !settings.noShowEnabled) {
      await cancelJob(job.id);
      return false;
    }
    if (job.type === "post_visit" && !settings.postVisitEnabled) {
      await cancelJob(job.id);
      return false;
    }
    if (job.type === "upsell" && !settings.upsellEnabled) {
      await cancelJob(job.id);
      return false;
    }

    // Don't nurture if booking dialog finished.
    if (job.type === "lead_nurture") {
      const [session] = await db
        .select({ state: chatbotSessionsTable.state })
        .from(chatbotSessionsTable)
        .where(
          and(
            eq(chatbotSessionsTable.clinicId, job.clinicId),
            eq(chatbotSessionsTable.phone, job.phone),
          ),
        )
        .limit(1);
      if (session?.state === "done") {
        await cancelJob(job.id);
        return false;
      }
    }

    const vars = await this.resolveJobVars(job);
    const text = this.renderTemplate(job.type, job.step, vars, settings.prompts);
    if (!text.trim()) {
      await cancelJob(job.id);
      return false;
    }

    // Past-due reminders that are already after the appointment — cancel.
    if (
      (job.type === "reminder_1h" || job.type === "reminder_24h") &&
      job.sendAt.getTime() < Date.now() - 3 * 60 * 60_000
    ) {
      // still send if within 3h of sendAt; else cancel
    }
    if (job.sendAt.getTime() < Date.now() - 6 * 60 * 60_000 && job.type.startsWith("reminder")) {
      await cancelJob(job.id);
      return false;
    }

    const sent = await this.sendCareMessage(job.clinicId, job.phone, text);
    if (sent === null) {
      // Gate busy — defer 2 minutes.
      await db
        .update(customerCareJobsTable)
        .set({ sendAt: new Date(Date.now() + 2 * 60_000), updatedAt: new Date() })
        .where(eq(customerCareJobsTable.id, job.id));
      return false;
    }

    await db
      .update(customerCareJobsTable)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(customerCareJobsTable.id, job.id));
    logger.info(
      { jobId: job.id, type: job.type, step: job.step, clinicId: job.clinicId },
      "[CustomerCare] Job sent",
    );
    return true;
  }

  private async resolveJobVars(job: typeof customerCareJobsTable.$inferSelect): Promise<{
    clinicName?: string;
    patientName?: string;
    time?: string;
    date?: string;
    doctorName?: string;
  }> {
    const payload = (job.payload ?? {}) as Record<string, string>;
    let clinicName = payload.clinicName;
    let patientName = payload.patientName;
    let doctorName = payload.doctorName;
    let time = payload.time;
    let date = payload.date;

    if (!clinicName) {
      const [clinic] = await db
        .select({ name: clinicsTable.name })
        .from(clinicsTable)
        .where(eq(clinicsTable.id, job.clinicId))
        .limit(1);
      clinicName = clinic?.name ?? undefined;
    }

    if (job.patientId && !patientName) {
      const [patient] = await db
        .select({ name: patientsTable.name })
        .from(patientsTable)
        .where(eq(patientsTable.id, job.patientId))
        .limit(1);
      patientName = patient?.name ?? undefined;
    }

    if (job.procedureId && (!time || !date || !doctorName)) {
      const [proc] = await db
        .select({
          scheduledAt: proceduresTable.scheduledAt,
          doctorId: proceduresTable.doctorId,
        })
        .from(proceduresTable)
        .where(eq(proceduresTable.id, job.procedureId))
        .limit(1);
      if (proc?.scheduledAt) {
        const d = new Date(proc.scheduledAt);
        date = d.toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" });
        time = d.toLocaleTimeString("ru-RU", {
          timeZone: "Asia/Almaty",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      if (proc?.doctorId && !doctorName) {
        const [doc] = await db
          .select({ name: usersTable.name })
          .from(usersTable)
          .where(eq(usersTable.id, proc.doctorId))
          .limit(1);
        doctorName = doc?.name ?? undefined;
      }
    }

    return { clinicName, patientName, time, date, doctorName };
  }

  classifyReplyIntent(text: string): CustomerCareReplyIntent {
    const t = text.trim().toLowerCase();
    if (!t) return "unknown";
    if (/(бол(ит|ь)|плох|дискомфорт|отёк|отек|кровит|жалоб)/i.test(t)) return "complaint";
    if (/(запис|хочу прийти|давайте запи|нужна консультац)/i.test(t)) return "want_booking";
    if (/(перенес|другое время|не смогу|отмен)/i.test(t)) return "reschedule";
    // thanks before confirm — "всё хорошо" must not become confirm_visit via «хорошо».
    if (/(спасибо|всё хорошо|все хорошо|норм|отлично)/i.test(t)) return "thanks_ok";
    if (/(подтверд|приду|буду|ок\b|хорошо|да\b|👍)/i.test(t)) return "confirm_visit";
    return "unknown";
  }
}

async function cancelJob(id: string): Promise<void> {
  await db
    .update(customerCareJobsTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(customerCareJobsTable.id, id));
}

function fillHandoff(prompt: string): string {
  // Prompt pack stores AI system prompt for handoff; use a short patient-facing line.
  if (prompt && !/ты\s|систем|роль/i.test(prompt) && prompt.length < 280) {
    return prompt;
  }
  return "Отлично 😊 Сейчас подберём удобное время и оформим запись.";
}

/** Warn (don't throw) when clinic has no Green API — reminders would silently fail. */
export async function assertGreenApiConfigured(
  clinicId: string,
  source: string,
): Promise<boolean> {
  const [clinic] = await db
    .select({
      greenApiInstanceId: clinicsTable.greenApiInstanceId,
      greenApiToken: clinicsTable.greenApiToken,
    })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, clinicId))
    .limit(1);
  const ok = Boolean(clinic?.greenApiInstanceId && clinic?.greenApiToken);
  if (!ok) {
    logger.warn(
      { clinicId, source },
      "[CustomerCare/Messaging] Green API not configured for clinic — WhatsApp send may fail",
    );
  }
  return ok;
}

export const customerCareChatbotService = new CustomerCareChatbotService();

export type { CustomerCareJob };
