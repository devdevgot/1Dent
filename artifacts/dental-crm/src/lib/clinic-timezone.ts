/**
 * Clinic wall-clock is Kazakhstan (UTC+5, Asia/Almaty).
 * Schedule day keys and timeline minutes must use this offset so chatbot
 * bookings (stored with +05:00) land on the same calendar day for every device TZ.
 */
const KZ_OFFSET_MS = 5 * 60 * 60 * 1000;

/** YYYY-MM-DD in clinic (Almaty) time. */
export function toClinicDateStr(d: Date): string {
  const shifted = new Date(d.getTime() + KZ_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Minutes from midnight in clinic (Almaty) time for an ISO timestamp. */
export function clinicTimeMins(iso: string): number {
  const shifted = new Date(new Date(iso).getTime() + KZ_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}
