/**
 * Customer Care Chatbot — types.
 * Separate from booking chatbot (`modules/chatbot`). Same clinic WhatsApp number.
 */

import type { CustomerCarePromptPack } from "@workspace/db";
import { DEFAULT_CUSTOMER_CARE_PROMPTS } from "./customer-care-prompts";

export type CustomerCareJobType =
  | "lead_nurture"
  | "reminder_1h"
  | "reminder_24h"
  | "no_show"
  | "post_visit"
  | "upsell";

export type CustomerCareJobStatus =
  | "pending"
  | "sent"
  | "replied"
  | "cancelled"
  | "failed";

export type CustomerCareReplyIntent =
  | "confirm_visit"
  | "reschedule"
  | "complaint"
  | "want_booking"
  | "thanks_ok"
  | "unknown";

/** Always hand off booking to the main chatbot — Care does not create procedures. */
export type CustomerCareBookingMode = "handoff_to_booking";

export interface CustomerCareJob {
  id: string;
  clinicId: string;
  patientId: string | null;
  phone: string;
  type: CustomerCareJobType;
  status: CustomerCareJobStatus;
  step: number;
  sendAt: Date;
  procedureId?: string | null;
  payload?: Record<string, unknown>;
}

export interface CustomerCareClinicSettings {
  enabled: boolean;
  leadNurtureEnabled: boolean;
  leadNurtureDelaysMinutes: [number, number, number];
  reminder1hEnabled: boolean;
  reminder24hEnabled: boolean;
  noShowEnabled: boolean;
  noShowGraceHours: number;
  postVisitEnabled: boolean;
  upsellEnabled: boolean;
  bookingMode: CustomerCareBookingMode;
  prompts: CustomerCarePromptPack;
}

/** Default before sync with chatbot_settings.enabled (getSettings always mirrors chatbot). */
export const DEFAULT_CUSTOMER_CARE_SETTINGS: CustomerCareClinicSettings = {
  enabled: false,
  leadNurtureEnabled: true,
  leadNurtureDelaysMinutes: [25, 150, 1440],
  reminder1hEnabled: true,
  reminder24hEnabled: true,
  noShowEnabled: true,
  noShowGraceHours: 2,
  postVisitEnabled: true,
  upsellEnabled: true,
  bookingMode: "handoff_to_booking",
  prompts: DEFAULT_CUSTOMER_CARE_PROMPTS,
};

export interface CustomerCareReplyResult {
  handled: boolean;
  /** Main booking chatbot should take over (doctor / slots / finalize). */
  handoffToBooking: boolean;
  intent: CustomerCareReplyIntent;
}
