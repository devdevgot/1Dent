import {
  db,
  usersTable,
  userSalarySettingsTable,
  payrollRecordsTable,
  proceduresTable,
} from "@workspace/db";
import {
  eq,
  and,
  gte,
  lte,
  sum,
  desc,
} from "drizzle-orm";

export class PayrollRepository {
  async getSalarySettings(userId: string, clinicId: string) {
    const [row] = await db
      .select()
      .from(userSalarySettingsTable)
      .where(
        and(
          eq(userSalarySettingsTable.userId, userId),
          eq(userSalarySettingsTable.clinicId, clinicId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async upsertSalarySettings(
    userId: string,
    clinicId: string,
    data: {
      salaryType: "fixed" | "commission" | "fixed_plus_commission";
      fixedAmount: string;
      commissionPercent: string;
    },
  ) {
    const [row] = await db
      .insert(userSalarySettingsTable)
      .values({ userId, clinicId, ...data })
      .onConflictDoUpdate({
        target: userSalarySettingsTable.userId,
        set: {
          salaryType: data.salaryType,
          fixedAmount: data.fixedAmount,
          commissionPercent: data.commissionPercent,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async listSalarySettings(clinicId: string) {
    return db
      .select({
        userId: userSalarySettingsTable.userId,
        clinicId: userSalarySettingsTable.clinicId,
        salaryType: userSalarySettingsTable.salaryType,
        fixedAmount: userSalarySettingsTable.fixedAmount,
        commissionPercent: userSalarySettingsTable.commissionPercent,
        updatedAt: userSalarySettingsTable.updatedAt,
        userName: usersTable.name,
        userRole: usersTable.role,
      })
      .from(userSalarySettingsTable)
      .leftJoin(usersTable, eq(userSalarySettingsTable.userId, usersTable.id))
      .where(eq(userSalarySettingsTable.clinicId, clinicId));
  }

  async getDoctorRevenueForPeriod(
    doctorId: string,
    clinicId: string,
    year: number,
    month: number,
  ): Promise<number> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const [result] = await db
      .select({ total: sum(proceduresTable.price) })
      .from(proceduresTable)
      .where(
        and(
          eq(proceduresTable.doctorId, doctorId),
          eq(proceduresTable.clinicId, clinicId),
          eq(proceduresTable.status, "completed"),
          gte(proceduresTable.createdAt, startDate),
          lte(proceduresTable.createdAt, endDate),
        ),
      );

    return Number(result?.total ?? 0);
  }

  async createPayrollRecord(data: {
    id: string;
    clinicId: string;
    userId: string;
    periodMonth: number;
    periodYear: number;
    salaryType: "fixed" | "commission" | "fixed_plus_commission";
    fixedAmount: string;
    commissionPercent: string;
    revenueBase: string;
    calculatedAmount: string;
  }) {
    const [row] = await db
      .insert(payrollRecordsTable)
      .values(data)
      .returning();
    return row;
  }

  async getPayrollRecord(id: string, clinicId: string) {
    const [row] = await db
      .select()
      .from(payrollRecordsTable)
      .where(
        and(eq(payrollRecordsTable.id, id), eq(payrollRecordsTable.clinicId, clinicId)),
      )
      .limit(1);
    return row ?? null;
  }

  async approvePayrollRecord(
    id: string,
    clinicId: string,
    approvedBy: string,
    approvedAmount: string,
  ) {
    const [row] = await db
      .update(payrollRecordsTable)
      .set({
        status: "approved",
        approvedAmount,
        approvedBy,
        approvedAt: new Date(),
      })
      .where(
        and(eq(payrollRecordsTable.id, id), eq(payrollRecordsTable.clinicId, clinicId)),
      )
      .returning();
    return row ?? null;
  }

  async listPayrollRecords(clinicId: string, userId?: string) {
    const baseQuery = db
      .select({
        id: payrollRecordsTable.id,
        clinicId: payrollRecordsTable.clinicId,
        userId: payrollRecordsTable.userId,
        periodMonth: payrollRecordsTable.periodMonth,
        periodYear: payrollRecordsTable.periodYear,
        salaryType: payrollRecordsTable.salaryType,
        fixedAmount: payrollRecordsTable.fixedAmount,
        commissionPercent: payrollRecordsTable.commissionPercent,
        revenueBase: payrollRecordsTable.revenueBase,
        calculatedAmount: payrollRecordsTable.calculatedAmount,
        approvedAmount: payrollRecordsTable.approvedAmount,
        status: payrollRecordsTable.status,
        approvedBy: payrollRecordsTable.approvedBy,
        approvedAt: payrollRecordsTable.approvedAt,
        createdAt: payrollRecordsTable.createdAt,
        userName: usersTable.name,
        userRole: usersTable.role,
      })
      .from(payrollRecordsTable)
      .leftJoin(usersTable, eq(payrollRecordsTable.userId, usersTable.id))
      .where(
        userId
          ? and(
              eq(payrollRecordsTable.clinicId, clinicId),
              eq(payrollRecordsTable.userId, userId),
            )
          : eq(payrollRecordsTable.clinicId, clinicId),
      )
      .orderBy(
        desc(payrollRecordsTable.periodYear),
        desc(payrollRecordsTable.periodMonth),
      );

    return baseQuery;
  }

  async getExistingRecord(
    clinicId: string,
    userId: string,
    periodYear: number,
    periodMonth: number,
  ) {
    const [row] = await db
      .select()
      .from(payrollRecordsTable)
      .where(
        and(
          eq(payrollRecordsTable.clinicId, clinicId),
          eq(payrollRecordsTable.userId, userId),
          eq(payrollRecordsTable.periodYear, periodYear),
          eq(payrollRecordsTable.periodMonth, periodMonth),
        ),
      )
      .limit(1);
    return row ?? null;
  }
}
