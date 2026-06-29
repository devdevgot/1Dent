import {
  db,
  proceduresTable,
  usersTable,
  doctorCapacityTable,
} from "@workspace/db";
import type { ClinicCalendarConfig, DaySchedule } from "@workspace/db";
import { and, eq, gte, lte, ne, inArray } from "drizzle-orm";
import {
  buildAlmatyDate,
  getAlmatyDayOfWeek,
  getAlmatyParts,
  isInvalidAppointmentTime,
} from "./almaty-time";
import type { DoctorWithSlots } from "./chatbot.service.types";

const ACTIVE_PROCEDURE_STATUSES = ["scheduled", "in_progress"] as const;

export const DEFAULT_WEEKLY_SCHEDULE: DaySchedule[] = [
  { day: 0, enabled: false, startHour: 9, startMinute: 0, endHour: 18, endMinute: 0 },
  { day: 1, enabled: true, startHour: 9, startMinute: 0, endHour: 18, endMinute: 0 },
  { day: 2, enabled: true, startHour: 9, startMinute: 0, endHour: 18, endMinute: 0 },
  { day: 3, enabled: true, startHour: 9, startMinute: 0, endHour: 18, endMinute: 0 },
  { day: 4, enabled: true, startHour: 9, startMinute: 0, endHour: 18, endMinute: 0 },
  { day: 5, enabled: true, startHour: 9, startMinute: 0, endHour: 18, endMinute: 0 },
  { day: 6, enabled: true, startHour: 9, startMinute: 0, endHour: 18, endMinute: 0 },
];

export const DEFAULT_CALENDAR_CONFIG: Required<
  Pick<ClinicCalendarConfig, "slotDurationMinutes" | "bufferMinutes" | "defaultAppointmentMinutes">
> & { weeklySchedule: DaySchedule[] } = {
  slotDurationMinutes: 30,
  bufferMinutes: 0,
  defaultAppointmentMinutes: 60,
  weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
};

export function resolveCalendarConfig(raw?: ClinicCalendarConfig | null): typeof DEFAULT_CALENDAR_CONFIG {
  const weekly = raw?.weeklySchedule?.length ? raw.weeklySchedule : DEFAULT_WEEKLY_SCHEDULE;
  return {
    slotDurationMinutes: raw?.slotDurationMinutes ?? DEFAULT_CALENDAR_CONFIG.slotDurationMinutes,
    bufferMinutes: raw?.bufferMinutes ?? DEFAULT_CALENDAR_CONFIG.bufferMinutes,
    defaultAppointmentMinutes:
      raw?.defaultAppointmentMinutes ?? DEFAULT_CALENDAR_CONFIG.defaultAppointmentMinutes,
    weeklySchedule: weekly,
  };
}

function getDaySchedule(config: typeof DEFAULT_CALENDAR_CONFIG, date: Date): DaySchedule | null {
  const dow = getAlmatyDayOfWeek(date);
  const day = config.weeklySchedule.find((d) => d.day === dow);
  if (!day?.enabled) return null;
  return day;
}

function dayStartEnd(date: Date, day: DaySchedule): { start: Date; end: Date } {
  const p = getAlmatyParts(date);
  const start = buildAlmatyDate(p.year, p.month, p.day, day.startHour, day.startMinute, 0);
  const end = buildAlmatyDate(p.year, p.month, p.day, day.endHour, day.endMinute, 0);
  return { start, end };
}

export interface BookedInterval {
  startMs: number;
  endMs: number;
}

export async function loadDoctorBookedIntervals(
  clinicId: string,
  doctorId: string,
  from: Date,
  to: Date,
  config: typeof DEFAULT_CALENDAR_CONFIG,
  excludeProcedureId?: string,
): Promise<BookedInterval[]> {
  const rows = await db
    .select({ id: proceduresTable.id, scheduledAt: proceduresTable.scheduledAt })
    .from(proceduresTable)
    .where(
      and(
        eq(proceduresTable.clinicId, clinicId),
        eq(proceduresTable.doctorId, doctorId),
        inArray(proceduresTable.status, [...ACTIVE_PROCEDURE_STATUSES]),
        gte(proceduresTable.scheduledAt, from),
        lte(proceduresTable.scheduledAt, to),
        excludeProcedureId ? ne(proceduresTable.id, excludeProcedureId) : undefined,
      ),
    );

  const blockMs = config.defaultAppointmentMinutes * 60 * 1000;
  const bufferMs = config.bufferMinutes * 60 * 1000;

  return rows
    .filter((r) => r.scheduledAt)
    .map((r) => {
      const startMs = r.scheduledAt!.getTime();
      return {
        startMs: startMs - bufferMs,
        endMs: startMs + blockMs + bufferMs,
      };
    });
}

function overlaps(intervals: BookedInterval[], startMs: number, endMs: number): boolean {
  return intervals.some((i) => startMs < i.endMs && endMs > i.startMs);
}

function countDayAppointments(intervals: BookedInterval[], dayStart: Date, dayEnd: Date): number {
  const startMs = dayStart.getTime();
  const endMs = dayEnd.getTime();
  return intervals.filter((i) => i.startMs >= startMs && i.startMs < endMs).length;
}

export function generateAvailableSlots(
  now: Date,
  bookedIntervals: BookedInterval[],
  config: typeof DEFAULT_CALENDAR_CONFIG,
  options?: {
    limit?: number;
    horizonDays?: number;
    maxPerDay?: number;
  },
): Date[] {
  const limit = options?.limit ?? 8;
  const horizonDays = options?.horizonDays ?? 14;
  const horizonEnd = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);
  const slotMs = config.slotDurationMinutes * 60 * 1000;
  const apptMs = config.defaultAppointmentMinutes * 60 * 1000;
  const slots: Date[] = [];

  let cursor = new Date(now.getTime() + slotMs);
  const cp = getAlmatyParts(cursor);
  cursor = buildAlmatyDate(cp.year, cp.month, cp.day, cp.hour, cp.minute, 0);

  while (slots.length < limit && cursor <= horizonEnd) {
    const daySchedule = getDaySchedule(config, cursor);
    if (daySchedule) {
      const { start, end } = dayStartEnd(cursor, daySchedule);
      if (cursor < start) cursor = new Date(start);
      if (cursor >= end) {
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
        continue;
      }

      const startMs = cursor.getTime();
      const endMs = startMs + apptMs;

      if (
        !isInvalidAppointmentTime(cursor, now) &&
        !overlaps(bookedIntervals, startMs, endMs)
      ) {
        if (options?.maxPerDay != null) {
          const dayCount = countDayAppointments(bookedIntervals, start, end);
          if (dayCount >= options.maxPerDay) {
            cursor = new Date(cursor.getTime() + slotMs);
            continue;
          }
        }
        slots.push(new Date(cursor));
      }
    }

    cursor = new Date(cursor.getTime() + slotMs);

    const nextDay = getDaySchedule(config, cursor);
    if (!nextDay) {
      const p = getAlmatyParts(cursor);
      cursor = buildAlmatyDate(p.year, p.month, p.day + 1, 0, 0, 0);
    } else {
      const { end } = dayStartEnd(cursor, nextDay);
      if (cursor >= end) {
        const p = getAlmatyParts(cursor);
        cursor = buildAlmatyDate(p.year, p.month, p.day + 1, nextDay.startHour, nextDay.startMinute, 0);
      }
    }
  }

  return slots;
}

export async function getDoctorAvailableSlots(
  clinicId: string,
  doctorId: string,
  calendarConfig?: ClinicCalendarConfig | null,
  options?: { limit?: number; horizonDays?: number; excludeProcedureId?: string },
): Promise<Date[]> {
  const config = resolveCalendarConfig(calendarConfig);
  const now = new Date();
  const horizonEnd = new Date(now.getTime() + (options?.horizonDays ?? 14) * 24 * 60 * 60 * 1000);

  const [capacityRow] = await db
    .select({ maxPatientsPerDay: doctorCapacityTable.maxPatientsPerDay })
    .from(doctorCapacityTable)
    .where(and(eq(doctorCapacityTable.clinicId, clinicId), eq(doctorCapacityTable.doctorId, doctorId)))
    .limit(1);

  const booked = await loadDoctorBookedIntervals(
    clinicId,
    doctorId,
    now,
    horizonEnd,
    config,
    options?.excludeProcedureId,
  );

  return generateAvailableSlots(now, booked, config, {
    limit: options?.limit ?? 8,
    horizonDays: options?.horizonDays ?? 14,
    maxPerDay: capacityRow?.maxPatientsPerDay,
  });
}

export async function getClinicDoctorsWithSlots(
  clinicId: string,
  calendarConfig?: ClinicCalendarConfig | null,
): Promise<DoctorWithSlots[]> {
  const doctors = await db
    .select({ id: usersTable.id, name: usersTable.name, specialty: usersTable.specialty })
    .from(usersTable)
    .where(and(eq(usersTable.clinicId, clinicId), eq(usersTable.role, "doctor"), eq(usersTable.isActive, true)))
    .limit(15);

  if (doctors.length === 0) return [];

  return Promise.all(
    doctors.map(async (doc) => ({
      id: doc.id,
      name: doc.name,
      specialty: doc.specialty ?? null,
      slots: await getDoctorAvailableSlots(clinicId, doc.id, calendarConfig, { limit: 6 }).catch(
        () => [] as Date[],
      ),
    })),
  );
}

export interface SlotValidationResult {
  ok: boolean;
  reason?: "past" | "outside_hours" | "occupied" | "day_full";
  nearestSlots?: Date[];
}

export async function validateAppointmentSlot(
  clinicId: string,
  doctorId: string,
  datetime: Date,
  calendarConfig?: ClinicCalendarConfig | null,
  excludeProcedureId?: string,
): Promise<SlotValidationResult> {
  const config = resolveCalendarConfig(calendarConfig);
  const now = new Date();

  if (isInvalidAppointmentTime(datetime, now)) {
    return { ok: false, reason: "past" };
  }

  const daySchedule = getDaySchedule(config, datetime);
  if (!daySchedule) {
    return {
      ok: false,
      reason: "outside_hours",
      nearestSlots: await getDoctorAvailableSlots(clinicId, doctorId, calendarConfig, { limit: 3 }),
    };
  }

  const { start, end } = dayStartEnd(datetime, daySchedule);
  const apptMs = config.defaultAppointmentMinutes * 60 * 1000;
  const startMs = datetime.getTime();
  const endMs = startMs + apptMs;

  if (datetime < start || new Date(endMs) > end) {
    return {
      ok: false,
      reason: "outside_hours",
      nearestSlots: await getDoctorAvailableSlots(clinicId, doctorId, calendarConfig, { limit: 3 }),
    };
  }

  const dayStart = start;
  const dayEnd = end;
  const booked = await loadDoctorBookedIntervals(
    clinicId,
    doctorId,
    dayStart,
    dayEnd,
    config,
    excludeProcedureId,
  );

  const [capacityRow] = await db
    .select({ maxPatientsPerDay: doctorCapacityTable.maxPatientsPerDay })
    .from(doctorCapacityTable)
    .where(and(eq(doctorCapacityTable.clinicId, clinicId), eq(doctorCapacityTable.doctorId, doctorId)))
    .limit(1);

  if (capacityRow?.maxPatientsPerDay != null) {
    const dayCount = countDayAppointments(booked, dayStart, dayEnd);
    if (dayCount >= capacityRow.maxPatientsPerDay) {
      return {
        ok: false,
        reason: "day_full",
        nearestSlots: await getDoctorAvailableSlots(clinicId, doctorId, calendarConfig, { limit: 3 }),
      };
    }
  }

  if (overlaps(booked, startMs, endMs)) {
    return {
      ok: false,
      reason: "occupied",
      nearestSlots: await getDoctorAvailableSlots(clinicId, doctorId, calendarConfig, {
        limit: 3,
        excludeProcedureId,
      }),
    };
  }

  return { ok: true };
}

/** Minutes until nearest free slot; null if none in horizon. */
export async function findNearestSlotMinutes(
  clinicId: string,
  doctorId: string,
  calendarConfig?: ClinicCalendarConfig | null,
): Promise<number | null> {
  const slots = await getDoctorAvailableSlots(clinicId, doctorId, calendarConfig, { limit: 1 });
  if (slots.length === 0) return null;
  return Math.max(0, Math.round((slots[0]!.getTime() - Date.now()) / 60_000));
}

export function formatSlotAlternatives(slots: Date[], formatter: (d: Date) => string): string {
  if (slots.length === 0) return "";
  return slots.map((s) => `• ${formatter(s)}`).join("\n");
}
