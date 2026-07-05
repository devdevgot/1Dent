import {
  db,
  patientsTable,
  proceduresTable,
  usersTable,
  notificationsTable,
  doctorCapacityTable,
} from "@workspace/db";
import { eq, and, gte, lte, count, sum, sql, isNotNull, SQL, ne } from "drizzle-orm";
import { analyticsCache } from "../../shared/analytics-cache";
import { findNearestSlotMinutes } from "../chatbot/calendar-slots";
import { getDoctorNpsMap } from "../../shared/patient-reviews";
import type { ScoringConfig } from "@workspace/db";

export interface DoctorAnalyticsFilters {
  dateFrom?: Date;
  dateTo?: Date;
  procedureType?: string;
  minRevenue?: number;
}

export interface PaymentMethodStat {
  method: string;
  label: string;
  amount: number;
  percent: number;
  color: string;
}

export interface OwnerAnalytics {
  totalPatients: number;
  newPatientsThisMonth: number;
  patientsByStatus: Record<string, number>;
  revenueThisMonth: number;
  completedProceduresThisMonth: number;
  redAlertCount: number;
  doctorKpis: DoctorKpi[];
  revenueByPaymentMethod: PaymentMethodStat[];
}

export interface DoctorAnalytics {
  myPatientsCount: number;
  myProceduresThisMonth: number;
  myRevenueThisMonth: number;
  scheduledToday: number;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
  procedures: number;
}

export interface DoctorDetailedAnalytics {
  doctorId: string;
  doctorName: string;
  patientsByStatus: Record<string, number>;
  proceduresByStatus: { completed: number; scheduled: number; in_progress: number; cancelled: number };
  proceduresByName: Array<{ name: string; count: number; revenue: number }>;
  revenueByMonth: MonthlyRevenue[];
  totalRevenue: number;
  totalPatients: number;
  totalProcedures: number;
  averageCheck: number;
  scheduledToday: number;
}

export interface AdminAnalytics {
  totalPatients: number;
  newPatientsToday: number;
  patientsByStatus: Record<string, number>;
  scheduledToday: number;
  redAlertCount: number;
}

export interface DoctorKpi {
  doctorId: string;
  doctorName: string;
  patientsCount: number;
  proceduresCount: number;
  revenueTotal: number;
  averageCheck: number;
  nps: number;
  score: number;
  slotsUsedToday: number;
  maxSlotsPerDay: number;
}

interface RawDoctorKpi {
  doctorId: string;
  doctorName: string;
  patientsCount: number;
  proceduresCount: number;
  cancelledCount: number;
  revenueTotal: number;
  averageCheck: number;
  nps: number;
  slotsUsedToday: number;
  maxSlotsPerDay: number;
  /** Minutes until the doctor's next free slot today (0 = available now, null = no schedule data) */
  nearestSlotMinutes: number | null;
}

function computeDoctorScore(
  kpi: RawDoctorKpi,
  allKpis: RawDoctorKpi[],
  scoring?: ScoringConfig,
): number {
  const revenueW = scoring?.revenueWeight ?? 35;
  const proceduresW = scoring?.proceduresWeight ?? 30;
  const checkW = scoring?.avgCheckWeight ?? 20;
  const conversionW = scoring?.conversionWeight ?? 15;
  const npsW = scoring?.npsWeight ?? 15;
  const operationalTotal = revenueW + proceduresW + checkW + conversionW;
  const scale = operationalTotal > 0 ? (100 - (kpi.nps > 0 ? npsW : 0)) / operationalTotal : 1;

  const maxRevenue = Math.max(...allKpis.map((k) => k.revenueTotal), 1);
  const maxProcedures = Math.max(...allKpis.map((k) => k.proceduresCount), 1);
  const maxCheck = Math.max(...allKpis.map((k) => k.averageCheck), 1);

  const conversionRaw = (kpi.proceduresCount + kpi.cancelledCount) > 0
    ? kpi.proceduresCount / (kpi.proceduresCount + kpi.cancelledCount)
    : 0;
  const maxConversionRaw = Math.max(
    ...allKpis.map((k) =>
      (k.proceduresCount + k.cancelledCount) > 0
        ? k.proceduresCount / (k.proceduresCount + k.cancelledCount)
        : 0,
    ),
    0.001,
  );

  const revenueNorm = kpi.revenueTotal / maxRevenue;
  const proceduresNorm = kpi.proceduresCount / maxProcedures;
  const checkNorm = kpi.averageCheck / maxCheck;
  const conversionNorm = conversionRaw / maxConversionRaw;

  let score =
    revenueNorm * revenueW * scale +
    proceduresNorm * proceduresW * scale +
    checkNorm * checkW * scale +
    conversionNorm * conversionW * scale;

  if (kpi.nps > 0 && npsW > 0) {
    score += (kpi.nps / 100) * npsW;
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

// ─── Advanced multi-factor doctor scoring ────────────────────────────────────

export type AdvancedScoringOptions = {
  serviceType?: string;
  urgency?: "urgent" | "soon" | "planned";
  patientType?: "new" | "returning" | "vip";
  returningPatientDoctorId?: string;
  /** Skip random exploration noise — for Playground / reproducible ranking */
  deterministic?: boolean;
};

export interface DoctorCandidate {
  id: string;
  name: string;
  specialty: string | null;
  finalScore: number;
  rankPercent: number;
  hasCapacity: boolean;
  nearestSlotMinutes: number | null;
  reasons: string[];
}

export interface AdvancedDoctorScore {
  doctorId: string;
  doctorName: string;
  finalScore: number;
  slotsUsedToday: number;
  maxSlotsPerDay: number;
  hasCapacity: boolean;
}

export function computeAdvancedScore(
  kpi: RawDoctorKpi,
  allKpis: RawDoctorKpi[],
  opts: AdvancedScoringOptions = {},
): number {
  const { serviceType, urgency, patientType, returningPatientDoctorId } = opts;

  // 1. base_score — normalized KPI composite (0–1)
  const maxRevenue = Math.max(...allKpis.map((k) => k.revenueTotal), 1);
  const maxProcedures = Math.max(...allKpis.map((k) => k.proceduresCount), 1);
  const maxCheck = Math.max(...allKpis.map((k) => k.averageCheck), 1);
  const conversionRaw = (kpi.proceduresCount + kpi.cancelledCount) > 0
    ? kpi.proceduresCount / (kpi.proceduresCount + kpi.cancelledCount)
    : 0;
  const maxConversionRaw = Math.max(
    ...allKpis.map((k) =>
      (k.proceduresCount + k.cancelledCount) > 0
        ? k.proceduresCount / (k.proceduresCount + k.cancelledCount) : 0,
    ), 0.001,
  );
  const baseScore =
    (kpi.revenueTotal / maxRevenue) * 0.35 +
    (kpi.proceduresCount / maxProcedures) * 0.30 +
    (kpi.averageCheck / maxCheck) * 0.20 +
    (conversionRaw / maxConversionRaw) * 0.15;

  // 2. quota_factor — load balancing: prefer doctors below their fair share
  const totalPatients = allKpis.reduce((s, k) => s + k.patientsCount, 0);
  const fairShare = totalPatients > 0 ? totalPatients / allKpis.length : 1;
  const quotaFactor = kpi.patientsCount <= fairShare
    ? 1.2
    : Math.max(0.5, 1 - ((kpi.patientsCount - fairShare) / (fairShare + 1)) * 0.3);

  // 3. load_factor — prefer doctors with more free capacity today
  const capacityRatio = kpi.slotsUsedToday / Math.max(kpi.maxSlotsPerDay, 1);
  const loadFactor = capacityRatio >= 1 ? 0.01 : 1 - capacityRatio * 0.6;

  // 4. value_factor — expensive services (VIP) go to top performers
  let valueFactor = 1.0;
  const expensiveServices = ["orthopedics", "surgery", "implantation"];
  if (patientType === "vip" || (serviceType && expensiveServices.includes(serviceType))) {
    // Boost top-revenue doctors for expensive cases
    valueFactor = 0.5 + (kpi.revenueTotal / maxRevenue) * 0.8;
  } else if (serviceType === "hygiene" || serviceType === "consultation") {
    // Spread simple cases more evenly
    valueFactor = quotaFactor;
  }

  // 5. patient_fit_factor
  let patientFitFactor = 1.0;
  if (patientType === "returning" && returningPatientDoctorId) {
    patientFitFactor = kpi.doctorId === returningPatientDoctorId ? 2.0 : 0.6;
  } else if (patientType === "vip") {
    patientFitFactor = 0.5 + (kpi.revenueTotal / maxRevenue);
  } else {
    // new patient — prefer high conversion doctors
    patientFitFactor = 0.5 + (conversionRaw / maxConversionRaw) * 0.7;
  }

  // 6. time_factor — prefer doctors with nearest available slot
  // nearestSlotMinutes=0 means available now, null means no slot data (neutral)
  let timeFactor = 1.0;
  const maxSlotMinutes = Math.max(
    ...allKpis.map((k) => k.nearestSlotMinutes ?? 0),
    1,
  );
  if (kpi.nearestSlotMinutes !== null && maxSlotMinutes > 0) {
    // Lower minutes → higher factor; fully booked doctor → 0.4
    timeFactor = 0.4 + 0.6 * (1 - kpi.nearestSlotMinutes / maxSlotMinutes);
  }

  // 7. exploration_factor — 60% exploit best, 40% random from top-3 (handled at selection level)
  const explorationNoise = opts.deterministic
    ? 1.0
    : 1.0 + (Math.random() - 0.5) * 0.1;

  const npsFactor = kpi.nps > 0 ? 0.7 + (kpi.nps / 100) * 0.3 : 1.0;

  const finalScore =
    baseScore * quotaFactor * loadFactor * valueFactor * patientFitFactor * timeFactor * explorationNoise * npsFactor;

  return Math.max(0, finalScore);
}

const SERVICE_SPECIALTY_HINTS: Record<string, string[]> = {
  therapy: ["therapist", "general", "терапевт", "терапия", "дантист", "dentist"],
  hygiene: ["hygienist", "therapist", "гигиен", "терапевт"],
  surgery: ["surgeon", "хирург", "surgery"],
  orthopedics: ["orthoped", "ортопед", "prosth"],
  orthodontics: ["orthodont", "ортодонт", "braces", "брекет"],
  implantation: ["implant", "implantolog", "хирург", "surgeon"],
  consultation: ["therapist", "general", "терапевт"],
};

function specialtyMatchesService(serviceType: string | undefined, specialty: string | null): boolean {
  if (!serviceType || !specialty) return false;
  const hints = SERVICE_SPECIALTY_HINTS[serviceType];
  if (!hints) return false;
  const lower = specialty.toLowerCase();
  return hints.some((h) => lower.includes(h));
}

function buildDoctorPickReasons(
  kpi: RawDoctorKpi,
  allKpis: RawDoctorKpi[],
  opts: AdvancedScoringOptions,
  rankPercent: number,
  specialty: string | null,
): string[] {
  const reasons: string[] = [];
  if (opts.returningPatientDoctorId === kpi.doctorId) {
    reasons.push("ваш постоянный врач");
  }
  if (opts.urgency === "urgent") {
    if (kpi.nearestSlotMinutes !== null && kpi.nearestSlotMinutes <= 120) {
      reasons.push("ближайший свободный слот");
    }
    if (kpi.slotsUsedToday < kpi.maxSlotsPerDay) {
      reasons.push("есть окно сегодня");
    }
  }
  if (rankPercent >= 75) {
    reasons.push("высокий рейтинг");
  } else if (rankPercent >= 55) {
    reasons.push("стабильно высокие показатели");
  }
  if (specialtyMatchesService(opts.serviceType, specialty)) {
    reasons.push("специализация под ваш запрос");
  }
  if (kpi.slotsUsedToday < kpi.maxSlotsPerDay * 0.5) {
    reasons.push("свободные окна на ближайшие дни");
  }
  const conversionRaw =
    kpi.proceduresCount + kpi.cancelledCount > 0
      ? kpi.proceduresCount / (kpi.proceduresCount + kpi.cancelledCount)
      : 0;
  if (conversionRaw >= 0.85 && reasons.length < 3) {
    reasons.push("высокая конверсия записей");
  }
  return reasons.slice(0, 3);
}

/** Rank doctors for chatbot — returns top N with scores and human-readable reasons. */
export async function rankDoctorCandidates(
  clinicId: string,
  opts: AdvancedScoringOptions = {},
  options?: { limit?: number; excludeIds?: string[] },
): Promise<DoctorCandidate[]> {
  const limit = options?.limit ?? 3;
  const excludeIds = new Set(options?.excludeIds ?? []);

  const repo = new AnalyticsRepository();
  const kpis = await repo.getDoctorKpisRaw(clinicId);
  if (kpis.length === 0) return [];

  const doctors = await db
    .select({ id: usersTable.id, specialty: usersTable.specialty })
    .from(usersTable)
    .where(and(eq(usersTable.clinicId, clinicId), eq(usersTable.role, "doctor")));
  const specialtyMap = new Map(doctors.map((d) => [d.id, d.specialty ?? null]));

  let pool = kpis.filter((k) => !excludeIds.has(k.doctorId));

  if (opts.urgency === "urgent") {
    pool = [...pool]
      .filter((k) => k.slotsUsedToday < k.maxSlotsPerDay)
      .sort((a, b) => {
        const aMin = a.nearestSlotMinutes ?? 9999;
        const bMin = b.nearestSlotMinutes ?? 9999;
        if (aMin !== bMin) return aMin - bMin;
        return a.slotsUsedToday / a.maxSlotsPerDay - b.slotsUsedToday / b.maxSlotsPerDay;
      });
    if (pool.length === 0) {
      pool = [...kpis.filter((k) => !excludeIds.has(k.doctorId))].sort(
        (a, b) => a.slotsUsedToday - b.slotsUsedToday,
      );
    }
  }

  const scored = pool.map((kpi) => {
    const specialty = specialtyMap.get(kpi.doctorId) ?? null;
    const finalScore = computeAdvancedScore(kpi, kpis, opts);
    const rankPercent = computeDoctorScore(kpi, kpis);
    return {
      id: kpi.doctorId,
      name: kpi.doctorName,
      specialty,
      finalScore,
      rankPercent,
      hasCapacity: kpi.slotsUsedToday < kpi.maxSlotsPerDay,
      nearestSlotMinutes: kpi.nearestSlotMinutes,
      reasons: buildDoctorPickReasons(kpi, kpis, opts, rankPercent, specialty),
    };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);

  const withCapacity = scored.filter((s) => s.hasCapacity);
  const ranked = (withCapacity.length > 0 ? withCapacity : scored).slice(0, limit);

  return ranked;
}

/** Pick the best doctor for chatbot routing using 7-factor advanced scoring. */
export async function pickBestDoctorAdvanced(
  clinicId: string,
  opts: AdvancedScoringOptions = {},
): Promise<{ id: string; name: string } | null> {
  // getDoctorKpisRaw is a standalone DB query — no repo state needed
  const repo = new AnalyticsRepository();
  const kpis = await repo.getDoctorKpisRaw(clinicId);
  if (kpis.length === 0) return null;

  // For urgent cases — skip scoring, pick whoever has nearest available slot / most free capacity
  if (opts.urgency === "urgent") {
    // Sort by nearestSlotMinutes ascending (nulls last), then by remaining capacity
    const withCapacity = [...kpis]
      .filter((k) => k.slotsUsedToday < k.maxSlotsPerDay)
      .sort((a, b) => {
        const aMin = a.nearestSlotMinutes ?? 9999;
        const bMin = b.nearestSlotMinutes ?? 9999;
        if (aMin !== bMin) return aMin - bMin;
        return (a.slotsUsedToday / a.maxSlotsPerDay) - (b.slotsUsedToday / b.maxSlotsPerDay);
      });

    if (withCapacity.length > 0) {
      return { id: withCapacity[0]!.doctorId, name: withCapacity[0]!.doctorName };
    }
    // All full — pick least loaded
    const sorted = [...kpis].sort((a, b) => a.slotsUsedToday - b.slotsUsedToday);
    return { id: sorted[0]!.doctorId, name: sorted[0]!.doctorName };
  }

  // Score all doctors using 7-factor algorithm
  const candidates = await rankDoctorCandidates(clinicId, opts, { limit: 3 });
  if (candidates.length === 0) return null;

  const pool = candidates.map((c) => ({
    doctorId: c.id,
    doctorName: c.name,
    score: c.finalScore,
    slotsUsedToday: 0,
    maxSlotsPerDay: 1,
  }));

  // Pick doctor based on the 50%-30%-20% motivation algorithm, generalized for N doctors using weights w_i = 0.6^i
  let pick = pool[0]!;
  if (pool.length > 1 && !opts.deterministic) {
    const weights = pool.map((_, idx) => Math.pow(0.6, idx));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let r = Math.random() * totalWeight;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i]!;
      if (r <= 0) {
        pick = pool[i]!;
        break;
      }
    }
  }

  return { id: pick.doctorId, name: pick.doctorName };
}

/**
 * Estimates minutes until a doctor's nearest free slot today.
 * Uses a linear model: 8-hour workday split evenly by maxSlotsPerDay.
 * Returns 0 if available now, null if fully booked.
 */
function computeNearestSlotMinutes(slotsUsedToday: number, maxSlotsPerDay: number): number | null {
  if (slotsUsedToday >= maxSlotsPerDay) return null;
  const workdayMinutes = 8 * 60;
  const slotDurationMinutes = Math.floor(workdayMinutes / maxSlotsPerDay);
  const nextSlotStartMinute = slotsUsedToday * slotDurationMinutes; // offset from 09:00
  const workdayStartMs = new Date().setHours(9, 0, 0, 0);
  const nextSlotMs = workdayStartMs + nextSlotStartMinute * 60_000;
  return Math.max(0, Math.round((nextSlotMs - Date.now()) / 60_000));
}

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export class AnalyticsRepository {
  async getOwnerAnalytics(clinicId: string): Promise<OwnerAnalytics> {
    const cacheKey = analyticsCache.key("owner", clinicId);
    const cached = await analyticsCache.get<OwnerAnalytics>(cacheKey);
    if (cached) return cached;

    const monthStart = startOfMonth();

    const [[allPatients, newPatients, monthlyProcedures, redAlerts], doctorKpis] =
      await Promise.all([
        Promise.all([
          db.select().from(patientsTable).where(eq(patientsTable.clinicId, clinicId)),
          db
            .select()
            .from(patientsTable)
            .where(
              and(
                eq(patientsTable.clinicId, clinicId),
                gte(patientsTable.createdAt, monthStart),
              ),
            ),
          db
            .select()
            .from(proceduresTable)
            .where(
              and(
                eq(proceduresTable.clinicId, clinicId),
                eq(proceduresTable.status, "completed"),
                gte(proceduresTable.completedAt, monthStart),
              ),
            ),
          db
            .select()
            .from(notificationsTable)
            .where(
              and(
                eq(notificationsTable.clinicId, clinicId),
                eq(notificationsTable.type, "red_alert"),
                eq(notificationsTable.read, false),
              ),
            ),
        ]),
        this.getDoctorKpis(clinicId),
      ]);

    const patientsByStatus: Record<string, number> = {};
    for (const p of allPatients) {
      patientsByStatus[p.status] = (patientsByStatus[p.status] ?? 0) + 1;
    }

    const revenueThisMonth = monthlyProcedures.reduce((acc, p) => acc + (p.price ?? 0), 0);
    const completedProceduresThisMonth = monthlyProcedures.length;

    const PAYMENT_META: Record<string, { label: string; color: string }> = {
      kaspi_transfer: { label: "Kaspi перевод", color: "#4B7BEC" },
      cash:           { label: "Наличка",       color: "#26de81" },
      kaspi_qr:       { label: "Kaspi QR",      color: "#fd9644" },
      terminal:       { label: "Терминал",      color: "#2d3436" },
      kaspi_red:      { label: "Kaspi RED",     color: "#fc5c65" },
      debt:           { label: "В долг",        color: "#a29bfe" },
    };

    const paymentTotals: Record<string, number> = {};
    for (const proc of monthlyProcedures) {
      const m = proc.paymentMethod ?? "cash";
      paymentTotals[m] = (paymentTotals[m] ?? 0) + (proc.price ?? 0);
    }
    const revenueByPaymentMethod: PaymentMethodStat[] = Object.entries(PAYMENT_META)
      .map(([method, meta]) => ({
        method,
        label:   meta.label,
        color:   meta.color,
        amount:  paymentTotals[method] ?? 0,
        percent: revenueThisMonth > 0
          ? Math.round(((paymentTotals[method] ?? 0) / revenueThisMonth) * 100)
          : 0,
      }))
      .filter((s) => s.amount > 0);

    const result: OwnerAnalytics = {
      totalPatients: allPatients.length,
      newPatientsThisMonth: newPatients.length,
      patientsByStatus,
      revenueThisMonth,
      completedProceduresThisMonth,
      redAlertCount: redAlerts.length,
      doctorKpis,
      revenueByPaymentMethod,
    };
    await analyticsCache.set(cacheKey, result);
    return result;
  }

  async getDoctorAnalytics(clinicId: string, doctorId: string): Promise<DoctorAnalytics> {
    const cacheKey = analyticsCache.key("doctor", clinicId, doctorId);
    const cached = await analyticsCache.get<DoctorAnalytics>(cacheKey);
    if (cached) return cached;

    const monthStart = startOfMonth();
    const dayStart = startOfDay();

    const [myPatients, monthlyProcedures, todayScheduled] = await Promise.all([
      db
        .select()
        .from(patientsTable)
        .where(
          and(
            eq(patientsTable.clinicId, clinicId),
            eq(patientsTable.doctorId, doctorId),
          ),
        ),
      db
        .select()
        .from(proceduresTable)
        .where(
          and(
            eq(proceduresTable.clinicId, clinicId),
            eq(proceduresTable.doctorId, doctorId),
            eq(proceduresTable.status, "completed"),
            gte(proceduresTable.completedAt, monthStart),
          ),
        ),
      db
        .select()
        .from(proceduresTable)
        .where(
          and(
            eq(proceduresTable.clinicId, clinicId),
            eq(proceduresTable.doctorId, doctorId),
            eq(proceduresTable.status, "scheduled"),
            gte(proceduresTable.scheduledAt, dayStart),
            lte(proceduresTable.scheduledAt, endOfDay()),
          ),
        ),
    ]);

    const myRevenueThisMonth = monthlyProcedures.reduce((acc, p) => acc + (p.price ?? 0), 0);

    const result: DoctorAnalytics = {
      myPatientsCount: myPatients.length,
      myProceduresThisMonth: monthlyProcedures.length,
      myRevenueThisMonth,
      scheduledToday: todayScheduled.length,
    };
    await analyticsCache.set(cacheKey, result);
    return result;
  }

  async getAdminAnalytics(clinicId: string): Promise<AdminAnalytics> {
    const cacheKey = analyticsCache.key("admin", clinicId);
    const cached = await analyticsCache.get<AdminAnalytics>(cacheKey);
    if (cached) return cached;

    const dayStart = startOfDay();

    const [allPatients, newToday, scheduledToday, redAlerts] = await Promise.all([
      db.select().from(patientsTable).where(eq(patientsTable.clinicId, clinicId)),
      db
        .select()
        .from(patientsTable)
        .where(
          and(
            eq(patientsTable.clinicId, clinicId),
            gte(patientsTable.createdAt, dayStart),
          ),
        ),
      db
        .select()
        .from(proceduresTable)
        .where(
          and(
            eq(proceduresTable.clinicId, clinicId),
            eq(proceduresTable.status, "scheduled"),
            gte(proceduresTable.scheduledAt, dayStart),
            lte(proceduresTable.scheduledAt, endOfDay()),
          ),
        ),
      db
        .select()
        .from(notificationsTable)
        .where(
          and(
            eq(notificationsTable.clinicId, clinicId),
            eq(notificationsTable.type, "red_alert"),
            eq(notificationsTable.read, false),
          ),
        ),
    ]);

    const patientsByStatus: Record<string, number> = {};
    for (const p of allPatients) {
      patientsByStatus[p.status] = (patientsByStatus[p.status] ?? 0) + 1;
    }

    const result: AdminAnalytics = {
      totalPatients: allPatients.length,
      newPatientsToday: newToday.length,
      patientsByStatus,
      scheduledToday: scheduledToday.length,
      redAlertCount: redAlerts.length,
    };
    await analyticsCache.set(cacheKey, result);
    return result;
  }

  async getDoctorDetailedAnalytics(
    clinicId: string,
    doctorId: string,
    filters?: DoctorAnalyticsFilters,
  ): Promise<DoctorDetailedAnalytics> {
    const hasFilters =
      filters &&
      (filters.dateFrom != null ||
        filters.dateTo != null ||
        filters.procedureType != null ||
        filters.minRevenue != null);

    // Only cache when no filters applied
    if (!hasFilters) {
      const cacheKey = analyticsCache.key("doctor-detail", clinicId, doctorId);
      const cached = await analyticsCache.get<DoctorDetailedAnalytics>(cacheKey);
      if (cached) return cached;
    }

    const dayStart = startOfDay();
    const dayEnd = endOfDay();

    // Build procedure conditions dynamically
    const procConditions: SQL[] = [
      eq(proceduresTable.clinicId, clinicId),
      eq(proceduresTable.doctorId, doctorId),
    ];
    if (filters?.dateFrom) procConditions.push(gte(proceduresTable.completedAt, filters.dateFrom));
    if (filters?.dateTo) procConditions.push(lte(proceduresTable.completedAt, filters.dateTo));
    if (filters?.procedureType) procConditions.push(eq(proceduresTable.name, filters.procedureType));
    if (filters?.minRevenue != null) procConditions.push(gte(proceduresTable.price, filters.minRevenue));

    const [doctor, patients, allProcedures, todayScheduled] = await Promise.all([
      db
        .select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(and(eq(usersTable.clinicId, clinicId), eq(usersTable.id, doctorId)))
        .then((rows) => rows[0] ?? null),
      db
        .select({ id: patientsTable.id, status: patientsTable.status })
        .from(patientsTable)
        .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.doctorId, doctorId))),
      db
        .select({
          id: proceduresTable.id,
          name: proceduresTable.name,
          status: proceduresTable.status,
          price: proceduresTable.price,
          completedAt: proceduresTable.completedAt,
        })
        .from(proceduresTable)
        .where(and(...procConditions)),
      db
        .select({ id: proceduresTable.id })
        .from(proceduresTable)
        .where(
          and(
            eq(proceduresTable.clinicId, clinicId),
            eq(proceduresTable.doctorId, doctorId),
            eq(proceduresTable.status, "scheduled"),
            gte(proceduresTable.scheduledAt, dayStart),
            lte(proceduresTable.scheduledAt, dayEnd),
          ),
        ),
    ]);

    // Patient status breakdown (always unfiltered — reflects current lifecycle state)
    const patientsByStatus: Record<string, number> = {};
    for (const p of patients) {
      patientsByStatus[p.status] = (patientsByStatus[p.status] ?? 0) + 1;
    }

    // Procedure counts by status (within filtered set)
    const proceduresByStatus = { completed: 0, scheduled: 0, in_progress: 0, cancelled: 0 };
    for (const p of allProcedures) {
      if (p.status === "completed") proceduresByStatus.completed++;
      else if (p.status === "scheduled") proceduresByStatus.scheduled++;
      else if (p.status === "in_progress") proceduresByStatus.in_progress++;
      else if (p.status === "cancelled") proceduresByStatus.cancelled++;
    }

    // Procedure breakdown by name with revenue
    const nameMap = new Map<string, { count: number; revenue: number }>();
    for (const p of allProcedures) {
      if (p.status !== "completed") continue;
      const entry = nameMap.get(p.name) ?? { count: 0, revenue: 0 };
      entry.count++;
      entry.revenue += p.price ?? 0;
      nameMap.set(p.name, entry);
    }
    const proceduresByName = Array.from(nameMap.entries())
      .map(([name, { count, revenue }]) => ({ name, count, revenue }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Monthly revenue — span from dateFrom to dateTo (or last 6 months if no filter)
    const now = new Date();
    const rangeStart = filters?.dateFrom ?? new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const rangeEnd = filters?.dateTo ?? now;

    // Build month buckets between rangeStart and rangeEnd
    const revenueByMonth: MonthlyRevenue[] = [];
    const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (cursor <= rangeEnd) {
      const mStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const mEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
      const monthLabel = cursor.toLocaleDateString("ru", { month: "short", year: "numeric" });

      const monthProcs = allProcedures.filter(
        (p) =>
          p.status === "completed" &&
          p.completedAt != null &&
          p.completedAt >= mStart &&
          p.completedAt <= mEnd,
      );
      revenueByMonth.push({
        month: monthLabel,
        revenue: monthProcs.reduce((acc, p) => acc + (p.price ?? 0), 0),
        procedures: monthProcs.length,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const completedProcs = allProcedures.filter((p) => p.status === "completed");
    const totalRevenue = completedProcs.reduce((acc, p) => acc + (p.price ?? 0), 0);
    const averageCheck = completedProcs.length > 0 ? totalRevenue / completedProcs.length : 0;

    const result: DoctorDetailedAnalytics = {
      doctorId,
      doctorName: doctor?.name ?? "",
      patientsByStatus,
      proceduresByStatus,
      proceduresByName,
      revenueByMonth,
      totalRevenue,
      totalPatients: patients.length,
      totalProcedures: completedProcs.length,
      averageCheck,
      scheduledToday: todayScheduled.length,
    };

    if (!hasFilters) {
      const cacheKey = analyticsCache.key("doctor-detail", clinicId, doctorId);
      await analyticsCache.set(cacheKey, result);
    }
    return result;
  }

  async invalidateClinicCache(clinicId: string): Promise<void> {
    await Promise.allSettled([
      analyticsCache.invalidate(analyticsCache.key("owner", clinicId)),
      analyticsCache.invalidate(analyticsCache.key("admin", clinicId)),
      analyticsCache.invalidate(analyticsCache.key("doctor", clinicId)),
      analyticsCache.invalidate(analyticsCache.key("kpi", clinicId)),
    ]);
  }

  async getDoctorKpis(clinicId: string): Promise<DoctorKpi[]> {
    const cacheKey = analyticsCache.key("kpi", clinicId);
    const cached = await analyticsCache.get<DoctorKpi[]>(cacheKey);
    if (cached) return cached;

    const rawKpis = await this.getDoctorKpisRaw(clinicId);

    const kpis: DoctorKpi[] = rawKpis.map((kpi) => ({
      doctorId: kpi.doctorId,
      doctorName: kpi.doctorName,
      patientsCount: kpi.patientsCount,
      proceduresCount: kpi.proceduresCount,
      revenueTotal: kpi.revenueTotal,
      averageCheck: kpi.averageCheck,
      nps: kpi.nps,
      slotsUsedToday: kpi.slotsUsedToday,
      maxSlotsPerDay: kpi.maxSlotsPerDay,
      score: computeDoctorScore(kpi, rawKpis),
    }));

    await analyticsCache.set(cacheKey, kpis);
    return kpis;
  }

  /** Returns raw (internal) KPI records for advanced scoring — bypasses public DoctorKpi shape. */
  async getDoctorKpisRaw(clinicId: string): Promise<RawDoctorKpi[]> {
    // Leverage the getDoctorKpis cache path to build rawKpis fresh each call
    // (the public method caches DoctorKpi which omits cancelledCount & nearestSlotMinutes)
    const doctors = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.clinicId, clinicId), eq(usersTable.role, "doctor")));

    if (doctors.length === 0) return [];

    const capacities = await db
      .select()
      .from(doctorCapacityTable)
      .where(eq(doctorCapacityTable.clinicId, clinicId));
    const capacityMap = new Map(capacities.map((c) => [c.doctorId, c.maxPatientsPerDay]));

    const todayStart = startOfDay();
    const todayEnd = endOfDay();
    const rollingSince = new Date();
    rollingSince.setDate(rollingSince.getDate() - 90);
    const npsMap = await getDoctorNpsMap(clinicId, 90);

    const rawKpis = await Promise.all(
      doctors.map(async (doc) => {
        const [patients, procedures, cancelledProcs, todayProcs] = await Promise.all([
          db.select().from(patientsTable).where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.doctorId, doc.id))),
          db.select().from(proceduresTable).where(and(
            eq(proceduresTable.clinicId, clinicId),
            eq(proceduresTable.doctorId, doc.id),
            eq(proceduresTable.status, "completed"),
            gte(proceduresTable.completedAt, rollingSince),
          )),
          db.select().from(proceduresTable).where(and(
            eq(proceduresTable.clinicId, clinicId),
            eq(proceduresTable.doctorId, doc.id),
            eq(proceduresTable.status, "cancelled"),
            gte(proceduresTable.scheduledAt, rollingSince),
          )),
          db.select({ id: proceduresTable.id }).from(proceduresTable).where(and(eq(proceduresTable.clinicId, clinicId), eq(proceduresTable.doctorId, doc.id), ne(proceduresTable.status, "cancelled"), gte(proceduresTable.scheduledAt, todayStart), lte(proceduresTable.scheduledAt, todayEnd))),
        ]);
        const revenueTotal = procedures.reduce((acc, p) => acc + (p.price ?? 0), 0);
        const averageCheck = procedures.length > 0 ? revenueTotal / procedures.length : 0;
        const maxSlotsPerDay = capacityMap.get(doc.id) ?? 20;
        const slotsUsedToday = todayProcs.length;

        const nearestSlotMinutes =
          (await findNearestSlotMinutes(clinicId, doc.id).catch(() => null)) ??
          computeNearestSlotMinutes(slotsUsedToday, maxSlotsPerDay);

        return {
          doctorId: doc.id,
          doctorName: doc.name,
          patientsCount: patients.length,
          proceduresCount: procedures.length,
          cancelledCount: cancelledProcs.length,
          revenueTotal,
          averageCheck,
          nps: npsMap.get(doc.id) ?? 0,
          slotsUsedToday,
          maxSlotsPerDay,
          nearestSlotMinutes,
        };
      }),
    );

    const clinicAvgProcedures =
      rawKpis.length > 0
        ? rawKpis.reduce((s, k) => s + k.proceduresCount, 0) / rawKpis.length
        : 0;

    return rawKpis.map((kpi) => {
      if (kpi.proceduresCount >= 5) return kpi;
      const blend = (5 - kpi.proceduresCount) / 5;
      return {
        ...kpi,
        proceduresCount: Math.round(kpi.proceduresCount + clinicAvgProcedures * blend),
        revenueTotal: kpi.revenueTotal + (clinicAvgProcedures * blend * (kpi.averageCheck || 10000)),
      };
    });
  }
}
