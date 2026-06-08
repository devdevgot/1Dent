/** Kazakhstan clinic timezone — no DST, always UTC+5. */
export const ALMATY_TZ = "Asia/Almaty";
export const ALMATY_OFFSET = "+05:00";

export interface AlmatyParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Extract calendar/time components in Asia/Almaty. */
export function getAlmatyParts(date: Date): AlmatyParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ALMATY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  // Some runtimes return hour "24" at midnight — normalize to 0.
  const hour = Number(parts.hour) % 24;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
  };
}

/** 0=Sun … 6=Sat in Asia/Almaty. */
export function getAlmatyDayOfWeek(date: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: ALMATY_TZ, weekday: "short" }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

/** Build a UTC instant from Almaty local date/time. */
export function buildAlmatyDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
): Date {
  return new Date(
    `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}${ALMATY_OFFSET}`,
  );
}

/** Start/end of the current calendar day in Almaty. */
export function getAlmatyDayBounds(date: Date = new Date()): { todayStart: Date; todayEnd: Date } {
  const p = getAlmatyParts(date);
  return {
    todayStart: buildAlmatyDate(p.year, p.month, p.day, 0, 0, 0),
    todayEnd: buildAlmatyDate(p.year, p.month, p.day, 23, 59, 59),
  };
}

/** `YYYY-MM-DDTHH` key for slot occupancy in Almaty. */
export function toAlmatyHourKey(date: Date): string {
  const p = getAlmatyParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}`;
}

/** ISO string with explicit +05:00 offset for LLM prompts. */
export function formatAlmatyIso(date: Date = new Date()): string {
  const p = getAlmatyParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:00${ALMATY_OFFSET}`;
}

/** DD.MM.YYYY in Almaty. */
export function formatAlmatyDateShort(date: Date = new Date()): string {
  const p = getAlmatyParts(date);
  return `${pad2(p.day)}.${pad2(p.month)}.${p.year}`;
}

/** YYYY-MM-DD in Almaty — unambiguous for LLM prompts. */
export function getAlmatyYmd(date: Date = new Date()): string {
  const p = getAlmatyParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Long Russian date with weekday and year in Almaty. */
export function formatAlmatyDateLong(date: Date = new Date()): string {
  return date.toLocaleDateString("ru-KZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ALMATY_TZ,
  });
}

/** Compact Russian date (day + month) in Almaty. */
export function formatAlmatyDayMonth(date: Date = new Date()): string {
  return date.toLocaleDateString("ru-KZ", { day: "numeric", month: "long", timeZone: ALMATY_TZ });
}

/** True when `date` falls on an earlier calendar day than `now` in Almaty. */
export function isBeforeAlmatyCalendarDay(date: Date, now: Date = new Date()): boolean {
  const d = getAlmatyParts(date);
  const n = getAlmatyParts(now);
  if (d.year !== n.year) return d.year < n.year;
  if (d.month !== n.month) return d.month < n.month;
  return d.day < n.day;
}

/** Full context string for LLM system prompts. */
export function formatAlmatyNowContext(date: Date = new Date()): string {
  const p = getAlmatyParts(date);
  const timeStr = date.toLocaleTimeString("ru-KZ", { hour: "2-digit", minute: "2-digit", timeZone: ALMATY_TZ });
  return `Сейчас: ${formatAlmatyDateLong(date)}, ${timeStr} (Алматы/Астана, UTC+5). Сегодня: ${getAlmatyYmd(date)}. ISO: ${formatAlmatyIso(date)}.`;
}

/**
 * Parse LLM/user datetime as Almaty local time.
 * Strings without timezone are treated as Asia/Almaty, not server local.
 */
export function parseAlmatyDatetime(iso: string | null | undefined): Date | null {
  if (!iso?.trim()) return null;
  let s = iso.trim();
  if (!/Z|[+-]\d{2}:\d{2}$/.test(s)) {
    if (!s.includes("T")) return null;
    if (!/T\d{2}:\d{2}/.test(s)) return null;
    if (!/T\d{2}:\d{2}:\d{2}/.test(s)) s = `${s}:00`;
    s = `${s}${ALMATY_OFFSET}`;
  }
  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isPastInAlmaty(date: Date, now: Date = new Date()): boolean {
  return date.getTime() < now.getTime();
}

/** Reject datetimes on past calendar days or earlier times today (Almaty). */
export function isInvalidAppointmentTime(date: Date, now: Date = new Date()): boolean {
  if (isBeforeAlmatyCalendarDay(date, now)) return true;
  return isPastInAlmaty(date, now);
}

const ALMATY_WEEKDAY_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/** Human-readable slot line: «пн, 8 июня в 14:00». */
export function formatAlmatySlot(date: Date): string {
  const day = ALMATY_WEEKDAY_SHORT[getAlmatyDayOfWeek(date)];
  const dateStr = date.toLocaleDateString("ru-KZ", { day: "numeric", month: "long", timeZone: ALMATY_TZ });
  const timeStr = date.toLocaleTimeString("ru-KZ", { hour: "2-digit", minute: "2-digit", timeZone: ALMATY_TZ });
  return `• ${day}, ${dateStr} в ${timeStr}`;
}

/** Compact slot for doctor lists: «пн 8 июня в 14:00». */
export function formatAlmatySlotCompact(date: Date): string {
  const day = ALMATY_WEEKDAY_SHORT[getAlmatyDayOfWeek(date)];
  const dateStr = date.toLocaleDateString("ru-KZ", { day: "numeric", month: "long", timeZone: ALMATY_TZ });
  const timeStr = date.toLocaleTimeString("ru-KZ", { hour: "2-digit", minute: "2-digit", timeZone: ALMATY_TZ });
  return `${day} ${dateStr} в ${timeStr}`;
}

function advanceAlmatyCursor(cursor: Date): Date {
  const next = new Date(cursor.getTime() + 60 * 60 * 1000);
  const p = getAlmatyParts(next);
  if (p.hour >= 18) {
    const noon = buildAlmatyDate(p.year, p.month, p.day, 12, 0, 0);
    const tomorrow = new Date(noon.getTime() + 24 * 60 * 60 * 1000);
    const tp = getAlmatyParts(tomorrow);
    return buildAlmatyDate(tp.year, tp.month, tp.day, 9, 0, 0);
  }
  return next;
}

/**
 * Returns up to `limit` nearest free hourly slots in Almaty working hours (09:00–18:00 Mon–Sat).
 * `bookedHours` keys must be Almaty `YYYY-MM-DDTHH`.
 */
export function computeAlmatyAvailableSlots(
  now: Date,
  bookedHours: Set<string>,
  limit = 5,
  horizonDays = 7,
): Date[] {
  const sevenDaysLater = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);
  const slots: Date[] = [];

  const p = getAlmatyParts(now);
  let cursor = buildAlmatyDate(p.year, p.month, p.day, p.hour + 1, 0, 0);
  const cp = getAlmatyParts(cursor);
  if (cp.hour < 9) cursor = buildAlmatyDate(cp.year, cp.month, cp.day, 9, 0, 0);

  while (slots.length < limit && cursor <= sevenDaysLater) {
    const parts = getAlmatyParts(cursor);
    const dow = getAlmatyDayOfWeek(cursor);

    if (dow !== 0 && parts.hour >= 9 && parts.hour < 18) {
      const hourKey = toAlmatyHourKey(cursor);
      if (!bookedHours.has(hourKey)) {
        slots.push(new Date(cursor));
      }
    }

    cursor = advanceAlmatyCursor(cursor);
  }

  return slots;
}
