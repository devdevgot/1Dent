import {
  db,
  patientsTable,
  proceduresTable,
  usersTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, gte, count, sum, sql } from "drizzle-orm";

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

export class AnalyticsRepository {
  async getOwnerAnalytics(clinicId: string): Promise<OwnerAnalytics> {
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

        return {
          doctorId: doc.id,
          doctorName: doc.name,
          patientsCount: doctorPatients.length,
          proceduresCount: doctorProcedures.length,
          revenueTotal,
        };
      }),
    );

    return {
      totalPatients: allPatients.length,
      newPatientsThisMonth: newPatients.length,
      patientsByStatus,
      revenueThisMonth,
      completedProceduresThisMonth,
      redAlertCount: redAlerts.length,
      doctorKpis,
    };
  }

  async getDoctorAnalytics(clinicId: string, doctorId: string): Promise<DoctorAnalytics> {
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
          ),
        ),
    ]);

    const myRevenueThisMonth = monthlyProcedures.reduce((acc, p) => acc + (p.price ?? 0), 0);

    return {
      myPatientsCount: myPatients.length,
      myProceduresThisMonth: monthlyProcedures.length,
      myRevenueThisMonth,
      scheduledToday: todayScheduled.length,
    };
  }

  async getAdminAnalytics(clinicId: string): Promise<AdminAnalytics> {
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

    return {
      totalPatients: allPatients.length,
      newPatientsToday: newToday.length,
      patientsByStatus,
      scheduledToday: scheduledToday.length,
      redAlertCount: redAlerts.length,
    };
  }

  async getDoctorKpis(clinicId: string): Promise<DoctorKpi[]> {
    const doctors = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.clinicId, clinicId),
          eq(usersTable.role, "doctor"),
        ),
      );

    return Promise.all(
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
        return {
          doctorId: doc.id,
          doctorName: doc.name,
          patientsCount: patients.length,
          proceduresCount: procedures.length,
          revenueTotal,
        };
      }),
    );
  }
}
