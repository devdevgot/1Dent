import {
  db,
  patientsTable,
  proceduresTable,
  usersTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, gte, lte, count, sum, sql, isNotNull, SQL } from "drizzle-orm";
import { analyticsCache } from "../../shared/analytics-cache";

export interface DoctorAnalyticsFilters {
  dateFrom?: Date;
  dateTo?: Date;
  procedureType?: string;
  minRevenue?: number;
}

export interface OwnerAnalytics {
  totalPatients: number;
  newPatientsThisMonth: number;
  patientsByStatus: Record<string, number>;
  revenueThisMonth: number;
  completedProceduresThisMonth: number;
  redAlertCount: number;
  doctorKpis: DoctorKpi[];
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

    const [allPatients, newPatients, monthlyProcedures, redAlerts, doctors] =
      await Promise.all([
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
        db
          .select()
          .from(usersTable)
          .where(
            and(
              eq(usersTable.clinicId, clinicId),
              eq(usersTable.role, "doctor"),
            ),
          ),
      ]);

    const patientsByStatus: Record<string, number> = {};
    for (const p of allPatients) {
      patientsByStatus[p.status] = (patientsByStatus[p.status] ?? 0) + 1;
    }

    const revenueThisMonth = monthlyProcedures.reduce((acc, p) => acc + (p.price ?? 0), 0);
    const completedProceduresThisMonth = monthlyProcedures.length;

    const doctorKpis: DoctorKpi[] = await Promise.all(
      doctors.map(async (doc) => {
        const [doctorPatients, doctorProcedures] = await Promise.all([
          db
            .select()
            .from(patientsTable)
            .where(
              and(
                eq(patientsTable.clinicId, clinicId),
                eq(patientsTable.doctorId, doc.id),
              ),
            ),
          db
            .select()
            .from(proceduresTable)
            .where(
              and(
                eq(proceduresTable.clinicId, clinicId),
                eq(proceduresTable.doctorId, doc.id),
                eq(proceduresTable.status, "completed"),
              ),
            ),
        ]);

        const revenueTotal = doctorProcedures.reduce((acc, p) => acc + (p.price ?? 0), 0);
        const averageCheck = doctorProcedures.length > 0 ? revenueTotal / doctorProcedures.length : 0;

        return {
          doctorId: doc.id,
          doctorName: doc.name,
          patientsCount: doctorPatients.length,
          proceduresCount: doctorProcedures.length,
          revenueTotal,
          averageCheck,
          nps: 0, // placeholder — will be populated from patient survey results (Task #7)
        };
      }),
    );

    const result: OwnerAnalytics = {
      totalPatients: allPatients.length,
      newPatientsThisMonth: newPatients.length,
      patientsByStatus,
      revenueThisMonth,
      completedProceduresThisMonth,
      redAlertCount: redAlerts.length,
      doctorKpis,
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
      await analyticsCache.set(cacheKey, result, 60);
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

    const doctors = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.clinicId, clinicId),
          eq(usersTable.role, "doctor"),
        ),
      );

    const kpis = await Promise.all(
      doctors.map(async (doc) => {
        const [patients, procedures] = await Promise.all([
          db
            .select()
            .from(patientsTable)
            .where(
              and(
                eq(patientsTable.clinicId, clinicId),
                eq(patientsTable.doctorId, doc.id),
              ),
            ),
          db
            .select()
            .from(proceduresTable)
            .where(
              and(
                eq(proceduresTable.clinicId, clinicId),
                eq(proceduresTable.doctorId, doc.id),
                eq(proceduresTable.status, "completed"),
              ),
            ),
        ]);
        const revenueTotal = procedures.reduce((acc, p) => acc + (p.price ?? 0), 0);
        const averageCheck = procedures.length > 0 ? revenueTotal / procedures.length : 0;
        return {
          doctorId: doc.id,
          doctorName: doc.name,
          patientsCount: patients.length,
          proceduresCount: procedures.length,
          revenueTotal,
          averageCheck,
          nps: 0, // placeholder — will be populated from patient survey results (Task #7)
        };
      }),
    );
    await analyticsCache.set(cacheKey, kpis);
    return kpis;
  }
}
