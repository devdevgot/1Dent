/** Active + completed appointment statuses shown on calendar views. */
const CALENDAR_VISIBLE_STATUSES = new Set(["scheduled", "in_progress", "completed"]);

/** Statuses whose time slot is fixed (visit already happened / closed). */
const SCHEDULE_LOCKED_STATUSES = new Set(["completed", "cancelled", "pending_payment"]);

export function isCalendarProcedure(proc: {
  scheduledAt?: string | null;
  status?: string | null;
}): boolean {
  if (!proc.scheduledAt) return false;
  const status = proc.status ?? "scheduled";
  return CALENDAR_VISIBLE_STATUSES.has(status);
}

/** True when the appointment time must not be dragged or rescheduled. */
export function isScheduleLockedProcedure(proc: {
  status?: string | null;
}): boolean {
  const status = proc.status ?? "scheduled";
  return SCHEDULE_LOCKED_STATUSES.has(status);
}
