/**
 * Customer Care Chatbot
 * ---------------------
 * Second logical bot on the **same** clinic WhatsApp (Green API) number.
 * Does NOT modify `modules/chatbot` — booking stays as-is.
 *
 * Capabilities (outbound + short reply handling):
 *  1. lead_nurture  — 2nd/3rd touch if lead did not book / went silent
 *  2. reminder_1h   — ~1 hour before scheduled visit (+ optional 24h)
 *  3. no_show       — visit time passed, still scheduled
 *  4. post_visit    — after completed consultation / treatment
 *  5. upsell        — invite patient to book again / next stage
 *  6. processReply  — handle patient answers to care messages; handoff to booking if needed
 *
 * Inbound routing (later, in messages.service — not in chatbot.service):
 *   if hasActiveCareContext → this.processReply
 *   else → ChatbotService.processMessage (unchanged)
 *
 * Feature flag: disabled by default until scheduler + DB jobs are wired.
 */

import { logger } from "../../lib/logger";
import { sendToPatient } from "../../shared/messaging";
import { customerCareTemplates } from "./customer-care-templates";
import {
  DEFAULT_CUSTOMER_CARE_SETTINGS,
  type CustomerCareClinicSettings,
  type CustomerCareJob,
  type CustomerCareJobType,
  type CustomerCareReplyIntent,
  type CustomerCareReplyResult,
} from "./customer-care-chatbot.types";

export class CustomerCareChatbotService {
  /** Per-clinic settings. DB-backed storage comes in a later phase. */
  async getSettings(_clinicId: string): Promise<CustomerCareClinicSettings> {
    return { ...DEFAULT_CUSTOMER_CARE_SETTINGS };
  }

  /**
   * True when this phone should be handled by Care instead of booking chatbot.
   * Used by messages.service router (thin glue).
   */
  async hasActiveCareContext(_clinicId: string, _phone: string): Promise<boolean> {
    // Phase 3: look up recent sent care jobs awaiting reply.
    return false;
  }

  // ── Capability 1: lead nurture (дожим) ───────────────────────────────────

  /**
   * Schedule nurture touches for a lead who started a booking dialog but did not finish.
   * Default delays: 25m → 2.5h → +1 day.
   */
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

  // ── Capability 2: visit reminders ────────────────────────────────────────

  /** Schedule 24h + 1h patient reminders for a scheduled procedure. */
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

  // ── Capability 3: no-show ────────────────────────────────────────────────

  /** After grace period past scheduledAt with status still scheduled → outreach. */
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

  // ── Capability 4: post-visit care ────────────────────────────────────────

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

  // ── Capability 5: upsell / return visit ──────────────────────────────────

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

  // ── Capability 6: inbound reply while care is active ─────────────────────

  async processReply(
    clinicId: string,
    phone: string,
    text: string,
  ): Promise<CustomerCareReplyResult> {
    const intent = this.classifyReplyIntent(text);
    logger.info({ clinicId, phone, intent }, "[CustomerCare] processReply");

    if (intent === "complaint") {
      // Later: notify staff + pause bots (reuse existing takeover helpers without editing chatbot.service).
      return { handled: true, handoffToBooking: false, intent };
    }

    if (intent === "want_booking" || intent === "reschedule") {
      // Handoff: let existing booking chatbot own the next turns.
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

    // Unknown — soft nudge; do not open full booking funnel here.
    await this.sendCareMessage(
      clinicId,
      phone,
      "Напишите, пожалуйста: подтвердить визит, перенести, или записаться снова — помогу 😊",
    );
    return { handled: true, handoffToBooking: false, intent: "unknown" };
  }

  // ── Outbound send (same WhatsApp path as booking bot) ────────────────────

  async sendCareMessage(clinicId: string, phone: string, content: string): Promise<void> {
    await sendToPatient(clinicId, phone, content);
  }

  /** Build copy for a job type (used by scheduler when flushing pending jobs). */
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
  ): string {
    switch (type) {
      case "lead_nurture":
        return customerCareTemplates.leadNurture(step, vars);
      case "reminder_24h":
        return customerCareTemplates.reminder24h(vars);
      case "reminder_1h":
        return customerCareTemplates.reminder1h(vars);
      case "no_show":
        return customerCareTemplates.noShow(vars);
      case "post_visit":
        return customerCareTemplates.postVisit(step, vars);
      case "upsell":
        return customerCareTemplates.upsell(vars);
      default:
        return "";
    }
  }

  /** Scheduler tick entrypoint — flush due jobs. Wired in Phase 1. */
  async processDueJobs(): Promise<number> {
    // Phase 1: load pending jobs where sendAt <= now, send via sendCareMessage.
    return 0;
  }

  // ── Internals ────────────────────────────────────────────────────────────

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

/** Re-export job shape for scheduler / future DB layer. */
export type { CustomerCareJob };
