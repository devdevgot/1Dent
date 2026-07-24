/**
 * Customer Care Chatbot — types.
 * Separate from booking chatbot (`modules/chatbot`). Same clinic WhatsApp number.
 */

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

export interface CustomerCareJob {
  id: string;
  clinicId: string;
  patientId: string | null;
  phone: string;
  type: CustomerCareJobType;
  status: CustomerCareJobStatus;
  /** Step in a multi-touch sequence (e.g. nurture 1/2/3). */
  step: number;
  sendAt: Date;
  procedureId?: string | null;
  payload?: Record<string, unknown>;
}

export interface CustomerCareClinicSettings {
  enabled: boolean;
  leadNurtureEnabled: boolean;
  /** Delays in minutes for nurture touches 1..3 (default 25 / 150 / 1440). */
  leadNurtureDelaysMinutes: [number, number, number];
  reminder1hEnabled: boolean;
  reminder24hEnabled: boolean;
  noShowEnabled: boolean;
  /** Hours after scheduledAt to treat as no-show (default 2). */
  noShowGraceHours: number;
  postVisitEnabled: boolean;
  upsellEnabled: boolean;
}

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
};

/** Result of handling an inbound reply while a care job is active. */
export interface CustomerCareReplyResult {
  handled: boolean;
  /** If true, messages.service should call booking ChatbotService.next. */
  handoffToBooking: boolean;
  intent: CustomerCareReplyIntent;
}
