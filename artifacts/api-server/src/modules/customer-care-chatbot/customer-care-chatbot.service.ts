/**
 * Customer Care Chatbot
 * ---------------------
 * Second logical bot on the **same** clinic WhatsApp (Green API) number.
 * Does NOT modify `modules/chatbot` — booking stays as-is.
 *
 * When the patient agrees to book after a Care message → handoffToBooking=true.
 * The MAIN booking chatbot then picks doctor, slots, and creates the procedure.
 * Care never inserts into `procedures` itself.
 */

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import {
  db,
  customerCareSettingsTable,
  chatbotSettingsTable,
  type CustomerCarePromptPack,
} from "@workspace/db";
import { logger } from "../../lib/logger";
import { sendToPatient } from "../../shared/messaging";
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
  // No chatbot_settings row → treat as off (new clinic hasn't enabled bot yet).
  return row?.enabled === true;
}

export class CustomerCareChatbotService {
  /**
   * Critical product rule: Customer Care is ON whenever the main booking chatbot is ON.
   * Called from chatbot.updateSettings and from getSettings (self-heal).
   */
  async syncEnabledWithChatbot(clinicId: string, chatbotEnabled: boolean): Promise<CustomerCareClinicSettings> {
    const current = await this.getSettingsRaw(clinicId);
    if (current.enabled === chatbotEnabled) {
      return current;
    }
    logger.info(
      { clinicId, chatbotEnabled, careWasEnabled: current.enabled },
      "[CustomerCare] Syncing enabled flag with main chatbot",
    );
    return this.persistSettings(clinicId, { ...current, enabled: chatbotEnabled });
  }

  /** Raw read without chatbot sync (avoids recursion). */
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
      // Cannot disable Care while booking chatbot is on (and vice versa when chatbot off).
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

  async hasActiveCareContext(_clinicId: string, _phone: string): Promise<boolean> {
    // Phase 3: look up recent sent care jobs awaiting reply.
    return false;
  }

  async scheduleLeadNurture(params: {
    clinicId: string;
    phone: string;
    patientId?: string | null;
  }): Promise<void> {
    const settings = await this.getSettings(params.clinicId);
    if (!settings.enabled || !settings.leadNurtureEnabled) return;
    logger.info(
      { clinicId: params.clinicId, phone: params.phone },
      "[CustomerCare] scheduleLeadNurture (stub — wire jobs table next)",
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
  }): Promise<void> {
    const settings = await this.getSettings(params.clinicId);
    if (!settings.enabled) return;
    if (!settings.reminder1hEnabled && !settings.reminder24hEnabled) return;
    logger.info(
      {
        clinicId: params.clinicId,
        procedureId: params.procedureId,
        scheduledAt: params.scheduledAt.toISOString(),
      },
      "[CustomerCare] scheduleVisitReminders (stub)",
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
    logger.info(
      { clinicId: params.clinicId, procedureId: params.procedureId },
      "[CustomerCare] scheduleNoShowFollowup (stub)",
    );
  }

  async schedulePostVisitCare(params: {
    clinicId: string;
    patientId: string;
    phone: string;
    procedureId: string;
  }): Promise<void> {
    const settings = await this.getSettings(params.clinicId);
    if (!settings.enabled || !settings.postVisitEnabled) return;
    logger.info(
      { clinicId: params.clinicId, procedureId: params.procedureId },
      "[CustomerCare] schedulePostVisitCare (stub)",
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
    logger.info(
      { clinicId: params.clinicId, patientId: params.patientId },
      "[CustomerCare] scheduleUpsell (stub)",
    );
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
    logger.info({ clinicId, phone, intent }, "[CustomerCare] processReply");

    if (intent === "complaint") {
      return { handled: true, handoffToBooking: false, intent };
    }

    if (intent === "want_booking" || intent === "reschedule") {
      // Always hand off — Care does not call finalizeBooking / insert procedures.
      await this.sendCareMessage(
        clinicId,
        phone,
        "Отлично 😊 Сейчас подберём удобное время и оформим запись.",
      );
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

  async sendCareMessage(clinicId: string, phone: string, content: string): Promise<void> {
    await sendToPatient(clinicId, phone, content);
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

  async processDueJobs(): Promise<number> {
    return 0;
  }

  classifyReplyIntent(text: string): CustomerCareReplyIntent {
    const t = text.trim().toLowerCase();
    if (!t) return "unknown";
    if (/(бол(ит|ь)|плох|дискомфорт|отёк|отек|кровит|жалоб)/i.test(t)) return "complaint";
    if (/(запис|хочу прийти|давайте запи|нужна консультац)/i.test(t)) return "want_booking";
    if (/(перенес|другое время|не смогу|отмен)/i.test(t)) return "reschedule";
    if (/(подтверд|приду|буду|ок\b|хорошо|да\b|👍)/i.test(t)) return "confirm_visit";
    if (/(спасибо|всё хорошо|все хорошо|норм|отлично)/i.test(t)) return "thanks_ok";
    return "unknown";
  }
}

export const customerCareChatbotService = new CustomerCareChatbotService();

export type { CustomerCareJob };
