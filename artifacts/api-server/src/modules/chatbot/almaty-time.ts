/**
 * Kazakhstan clinic time (Almaty / Astana).
 * Fixed UTC+5 since 1 March 2024 — computed from UTC directly so results
 * do not depend on possibly outdated IANA tzdata (which may still report +6).
 */
export const ALMATY_TZ = "Asia/Almaty";
export const KZ_UTC_OFFSET_MINUTES = 5 * 60;
export const ALMATY_OFFSET = "+05:00";
export const KZ_UTC_OFFSET_LABEL = "UTC+5";

export interface AlmatyParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

const MONTH_NAMES_LONG: Record<number, string> = {
  1: "января",
  2: "февраля",
  3: "марта",
  4: "апреля",
  5: "мая",
  6: "июня",
  7: "июля",
  8: "августа",
  9: "сентября",
  10: "октября",
  11: "ноября",
  12: "декабря",
};

const WEEKDAY_NAMES_LONG: Record<number, string> = {
  0: "воскресенье",
  1: "понедельник",
  2: "вторник",
  3: "среда",
  4: "четверг",
  5: "пятница",
  6: "суббота",
};

const ALMATY_WEEKDAY_SHORT: Record<number, string> = {
  0: "вс", 1: "пн", 2: "вт", 3: "ср", 4: "чт", 5: "пт", 6: "сб",
};

/** Extract calendar/time components in Kazakhstan (UTC+5). */
export function getAlmatyParts(date: Date): AlmatyParts {
  const shifted = new Date(date.getTime() + KZ_UTC_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** 0=Sun … 6=Sat in Kazakhstan (UTC+5). */
export function getAlmatyDayOfWeek(date: Date): number {
  const p = getAlmatyParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** Build a UTC instant from Kazakhstan local date/time (UTC+5). */
export function buildAlmatyDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
): Date {
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - KZ_UTC_OFFSET_MINUTES * 60_000;
  return new Date(utcMs);
}

/** Start/end of the current calendar day in Kazakhstan. */
export function getAlmatyDayBounds(date: Date = new Date()): { todayStart: Date; todayEnd: Date } {
  const p = getAlmatyParts(date);
  return {
    todayStart: buildAlmatyDate(p.year, p.month, p.day, 0, 0, 0),
    todayEnd: buildAlmatyDate(p.year, p.month, p.day, 23, 59, 59),
  };
}

/** `YYYY-MM-DDTHH` key for slot occupancy in Kazakhstan. */
export function toAlmatyHourKey(date: Date): string {
  const p = getAlmatyParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}`;
}

/** Local time as H:mm — e.g. «0:57», «14:00». */
export function formatAlmatyTime(date: Date = new Date()): string {
  const p = getAlmatyParts(date);
  return `${p.hour}:${pad2(p.minute)}`;
}

/** ISO string with explicit +05:00 offset for LLM prompts. */
export function formatAlmatyIso(date: Date = new Date()): string {
  const p = getAlmatyParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:00${ALMATY_OFFSET}`;
}

/** DD.MM.YYYY in Kazakhstan. */
export function formatAlmatyDateShort(date: Date = new Date()): string {
  const p = getAlmatyParts(date);
  return `${pad2(p.day)}.${pad2(p.month)}.${p.year}`;
}

/** YYYY-MM-DD in Kazakhstan — unambiguous for LLM prompts. */
export function getAlmatyYmd(date: Date = new Date()): string {
  const p = getAlmatyParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Long Russian date with weekday and year in Kazakhstan. */
export function formatAlmatyDateLong(date: Date = new Date()): string {
  const p = getAlmatyParts(date);
  const weekday = WEEKDAY_NAMES_LONG[getAlmatyDayOfWeek(date)];
  const month = MONTH_NAMES_LONG[p.month] ?? String(p.month);
  return `${weekday}, ${p.day} ${month} ${p.year} г.`;
}

/** Compact Russian date (day + month) in Kazakhstan. */
export function formatAlmatyDayMonth(date: Date = new Date()): string {
  const p = getAlmatyParts(date);
  const month = MONTH_NAMES_LONG[p.month] ?? String(p.month);
  return `${p.day} ${month}`;
}

/** «понедельник, 9 июня, 14:00» */
export function formatAlmatyDateTimeLong(date: Date): string {
  const p = getAlmatyParts(date);
  const weekday = WEEKDAY_NAMES_LONG[getAlmatyDayOfWeek(date)];
  const month = MONTH_NAMES_LONG[p.month] ?? String(p.month);
  return `${weekday}, ${p.day} ${month}, ${formatAlmatyTime(date)}`;
}

/** «пн, 9 июня, 14:00» */
export function formatAlmatyDateTimeShort(date: Date): string {
  const p = getAlmatyParts(date);
  const weekday = ALMATY_WEEKDAY_SHORT[getAlmatyDayOfWeek(date)];
  const month = MONTH_NAMES_LONG[p.month] ?? String(p.month);
  return `${weekday}, ${p.day} ${month}, ${formatAlmatyTime(date)}`;
}

/** True when `date` falls on an earlier calendar day than `now` in Kazakhstan. */
export function isBeforeAlmatyCalendarDay(date: Date, now: Date = new Date()): boolean {
  const d = getAlmatyParts(date);
  const n = getAlmatyParts(now);
  if (d.year !== n.year) return d.year < n.year;
  if (d.month !== n.month) return d.month < n.month;
  return d.day < n.day;
}

/** Full context string for LLM system prompts. */
export function formatAlmatyNowContext(date: Date = new Date()): string {
  return `Сейчас: ${formatAlmatyDateLong(date)}, ${formatAlmatyTime(date)} (Казахстан, ${KZ_UTC_OFFSET_LABEL}). Сегодня: ${getAlmatyYmd(date)}. ISO: ${formatAlmatyIso(date)}.`;
}

/**
 * Parse LLM/user datetime as Kazakhstan local time (UTC+5).
 * Strings without timezone are treated as local clinic time, not server local.
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

/** Reject datetimes on past calendar days or earlier times today (Kazakhstan). */
export function isInvalidAppointmentTime(date: Date, now: Date = new Date()): boolean {
  if (isBeforeAlmatyCalendarDay(date, now)) return true;
  return isPastInAlmaty(date, now);
}

/** Human-readable slot line: «пн, 9 июня в 14:00». */
export function formatAlmatySlot(date: Date): string {
  const p = getAlmatyParts(date);
  const day = ALMATY_WEEKDAY_SHORT[getAlmatyDayOfWeek(date)] ?? "?";
  const month = MONTH_NAMES_LONG[p.month] ?? String(p.month);
  return `• ${day}, ${p.day} ${month} в ${formatAlmatyTime(date)}`;
}

/** Compact slot for doctor lists: «пн 9 июня в 14:00». */
export function formatAlmatySlotCompact(date: Date): string {
  const p = getAlmatyParts(date);
  const day = ALMATY_WEEKDAY_SHORT[getAlmatyDayOfWeek(date)] ?? "?";
  const month = MONTH_NAMES_LONG[p.month] ?? String(p.month);
  return `${day} ${p.day} ${month} в ${formatAlmatyTime(date)}`;
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
 * Returns up to `limit` nearest free hourly slots in Kazakhstan working hours (09:00–18:00 Mon–Sat).
 * `bookedHours` keys must be `YYYY-MM-DDTHH` in clinic local time.
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
