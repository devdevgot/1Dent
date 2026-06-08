/** Active appointment statuses shown on calendar views. */
const CALENDAR_VISIBLE_STATUSES = new Set(["scheduled", "in_progress"]);

export function isCalendarProcedure(proc: {
  scheduledAt?: string | null;
  status?: string | null;
}): boolean {
  if (!proc.scheduledAt) return false;
  const status = proc.status ?? "scheduled";
  return CALENDAR_VISIBLE_STATUSES.has(status);
}
