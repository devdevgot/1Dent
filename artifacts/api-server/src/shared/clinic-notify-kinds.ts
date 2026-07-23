import type { NotificationPrefGroup, NotificationType, UserRole } from "@workspace/db";

/** Structured notification kinds used in payload.kind */
export const NOTIFY_KINDS = {
  inbound_chat: "inbound_chat",
  appointment_created: "appointment_created",
  appointment_rescheduled: "appointment_rescheduled",
  appointment_cancelled: "appointment_cancelled",
  appointment_reassigned: "appointment_reassigned",
  pending_payment: "pending_payment",
  payment_received: "payment_received",
  payment_debt: "payment_debt",
  payment_overdue: "payment_overdue",
  patient_stage_changed: "patient_stage_changed",
  landing_lead: "landing_lead",
  tablet_pairing: "tablet_pairing",
  tablet_pairing_expired: "tablet_pairing_expired",
  ai_diagnosis_ready: "ai_diagnosis_ready",
  treatment_plan_created: "treatment_plan_created",
  treatment_plan_approved: "treatment_plan_approved",
  treatment_plan_sent: "treatment_plan_sent",
  review_low: "review_low",
  review_positive: "review_positive",
  broadcast_finished: "broadcast_finished",
  broadcast_failed: "broadcast_failed",
  broadcast_reply: "broadcast_reply",
  contract_viewed: "contract_viewed",
  contract_signed: "contract_signed",
  human_takeover: "human_takeover",
  ai_credits_exhausted: "ai_credits_exhausted",
  low_stock: "low_stock",
} as const;

export type NotifyKind = (typeof NOTIFY_KINDS)[keyof typeof NOTIFY_KINDS];

export const KIND_TO_GROUP: Record<NotifyKind, NotificationPrefGroup> = {
  inbound_chat: "chats",
  appointment_created: "appointments",
  appointment_rescheduled: "appointments",
  appointment_cancelled: "appointments",
  appointment_reassigned: "appointments",
  pending_payment: "payments",
  payment_received: "payments",
  payment_debt: "payments",
  payment_overdue: "payments",
  patient_stage_changed: "stages",
  landing_lead: "operations",
  tablet_pairing: "operations",
  tablet_pairing_expired: "operations",
  ai_diagnosis_ready: "treatment",
  treatment_plan_created: "treatment",
  treatment_plan_approved: "treatment",
  treatment_plan_sent: "treatment",
  review_low: "reviews",
  review_positive: "reviews",
  broadcast_finished: "broadcasts",
  broadcast_failed: "broadcasts",
  broadcast_reply: "broadcasts",
  contract_viewed: "contracts",
  contract_signed: "contracts",
  human_takeover: "chats",
  ai_credits_exhausted: "operations",
  low_stock: "operations",
};

/** Role defaults: which roles receive which kind (before user mute prefs). */
export const KIND_ROLE_DEFAULTS: Record<NotifyKind, UserRole[]> = {
  inbound_chat: ["owner", "admin", "doctor"],
  appointment_created: ["owner", "admin", "doctor"],
  appointment_rescheduled: ["owner", "admin", "doctor"],
  appointment_cancelled: ["owner", "admin", "doctor"],
  appointment_reassigned: ["owner", "admin", "doctor"],
  pending_payment: ["owner", "admin", "accountant"],
  payment_received: ["owner", "admin", "accountant"],
  payment_debt: ["owner", "admin", "accountant"],
  payment_overdue: ["owner", "admin", "accountant"],
  patient_stage_changed: ["owner", "admin", "doctor"],
  landing_lead: ["owner", "admin"],
  tablet_pairing: ["owner", "admin"],
  tablet_pairing_expired: ["owner", "admin"],
  ai_diagnosis_ready: ["owner", "admin", "doctor"],
  treatment_plan_created: ["owner", "admin", "doctor"],
  treatment_plan_approved: ["owner", "admin", "doctor"],
  treatment_plan_sent: ["owner", "admin", "doctor"],
  review_low: ["owner", "admin", "doctor"],
  review_positive: ["owner", "admin", "doctor"],
  broadcast_finished: ["owner", "admin"],
  broadcast_failed: ["owner", "admin"],
  broadcast_reply: ["owner", "admin"],
  contract_viewed: ["owner", "admin"],
  contract_signed: ["owner", "admin", "doctor"],
  human_takeover: ["owner", "admin"],
  ai_credits_exhausted: ["owner"],
  low_stock: ["owner", "admin", "warehouse"],
};

export const KIND_TO_TYPE: Record<NotifyKind, NotificationType> = {
  inbound_chat: "new_message",
  appointment_created: "appointment",
  appointment_rescheduled: "appointment",
  appointment_cancelled: "appointment",
  appointment_reassigned: "appointment",
  pending_payment: "pending_payment",
  payment_received: "pending_payment",
  payment_debt: "pending_payment",
  payment_overdue: "pending_payment",
  patient_stage_changed: "system",
  landing_lead: "system",
  tablet_pairing: "system",
  tablet_pairing_expired: "system",
  ai_diagnosis_ready: "system",
  treatment_plan_created: "system",
  treatment_plan_approved: "system",
  treatment_plan_sent: "system",
  review_low: "system",
  review_positive: "system",
  broadcast_finished: "system",
  broadcast_failed: "system",
  broadcast_reply: "system",
  contract_viewed: "system",
  contract_signed: "system",
  human_takeover: "system",
  ai_credits_exhausted: "system",
  low_stock: "system",
};

/** Stages that warrant a staff push (not every micro-transition). */
export const NOTIFY_STAGE_STATUSES = new Set([
  "new_request",
  "diagnostics",
  "treatment_assigned",
  "payment_processing",
  "post_op_monitoring",
  "repeat_sale",
  "rejected",
]);

const STAGE_LABELS: Record<string, string> = {
  new_request: "Новая заявка",
  diagnostics: "Диагностика",
  treatment_assigned: "План лечения",
  payment_processing: "Оплата",
  post_op_monitoring: "Постоперационный контроль",
  repeat_sale: "Повторная продажа",
  rejected: "Отказ",
};

export function stageLabel(status: string): string {
  return STAGE_LABELS[status] ?? status;
}

const dedupHits = new Map<string, number>();
const DEDUP_CLEAN_EVERY = 200;
let dedupOps = 0;

function pruneDedup(now: number): void {
  dedupOps += 1;
  if (dedupOps % DEDUP_CLEAN_EVERY !== 0) return;
  for (const [key, expires] of dedupHits) {
    if (expires <= now) dedupHits.delete(key);
  }
}

/** Returns true if this key was already seen within ttlMs (should skip). */
export function isDuplicateNotify(key: string, ttlMs: number): boolean {
  const now = Date.now();
  pruneDedup(now);
  const prev = dedupHits.get(key);
  if (prev && prev > now) return true;
  dedupHits.set(key, now + ttlMs);
  return false;
}

export function groupForKind(kind: NotifyKind): NotificationPrefGroup {
  return KIND_TO_GROUP[kind];
}

export function rolesForKind(kind: NotifyKind): UserRole[] {
  return KIND_ROLE_DEFAULTS[kind];
}
