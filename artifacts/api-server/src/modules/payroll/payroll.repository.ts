import {
  db,
  usersTable,
  userSalarySettingsTable,
  payrollRecordsTable,
  proceduresTable,
  clinicExpensesTable,
} from "@workspace/db";
import {
  eq,
  and,
  gte,
  lt,
  sum,
  desc,
} from "drizzle-orm";
import { randomUUID } from "crypto";

export interface PayrollPreviewRow {
  userId: string;
  userName: string;
  userRole: string;
  salaryType: "fixed" | "commission" | "fixed_plus_commission";
  fixedAmount: number;
  commissionPercent: number;
  revenueBase: number;
  calculatedAmount: number;
}

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

  private async getDoctorRevenueForPeriod(
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
          gte(proceduresTable.completedAt, startDate),
          lt(proceduresTable.completedAt, endDate),
        ),
      );

    return Number(result?.total ?? 0);
  }

  private calcSalary(
    salaryType: "fixed" | "commission" | "fixed_plus_commission",
    fixedAmount: number,
    commissionPercent: number,
    revenueBase: number,
  ): number {
    if (salaryType === "fixed") return fixedAmount;
    if (salaryType === "commission")
      return (revenueBase * commissionPercent) / 100;
    return fixedAmount + (revenueBase * commissionPercent) / 100;
  }

  async previewPayrollForPeriod(
    clinicId: string,
    year: number,
    month: number,
  ): Promise<PayrollPreviewRow[]> {
    const settings = await this.listSalarySettings(clinicId);
    const rows: PayrollPreviewRow[] = [];

    for (const s of settings) {
      if (!s.userId) continue;
      const revenue = await this.getDoctorRevenueForPeriod(
        s.userId,
        clinicId,
        year,
        month,
      );
      const fixedAmount = Number(s.fixedAmount ?? 0);
      const commissionPercent = Number(s.commissionPercent ?? 0);
      const salaryType = s.salaryType as "fixed" | "commission" | "fixed_plus_commission";
      const calculatedAmount = this.calcSalary(
        salaryType,
        fixedAmount,
        commissionPercent,
        revenue,
      );
      rows.push({
        userId: s.userId,
        userName: s.userName ?? "",
        userRole: s.userRole ?? "",
        salaryType,
        fixedAmount,
        commissionPercent,
        revenueBase: revenue,
        calculatedAmount,
      });
    }

    return rows;
  }

  async approvePeriodPayroll(
    clinicId: string,
    approvedBy: string,
    year: number,
    month: number,
    employees: Array<{
      userId: string;
      approvedAmount: number;
      notes?: string;
    }>,
  ) {
    const preview = await this.previewPayrollForPeriod(clinicId, year, month);

    const upserted: typeof payrollRecordsTable.$inferSelect[] = [];

    for (const emp of employees) {
      const row = preview.find((p) => p.userId === emp.userId);
      if (!row) continue;

      const values = {
        clinicId,
        userId: emp.userId,
        periodMonth: month,
        periodYear: year,
        salaryType: row.salaryType,
        fixedAmount: String(row.fixedAmount),
        commissionPercent: String(row.commissionPercent),
        revenueBase: String(row.revenueBase),
        calculatedAmount: String(row.calculatedAmount),
        approvedAmount: String(emp.approvedAmount),
        status: "approved" as const,
        approvedBy,
        approvedAt: new Date(),
        notes: emp.notes ?? null,
      };

      const [saved] = await db
        .insert(payrollRecordsTable)
        .values({ id: randomUUID(), ...values })
        .onConflictDoUpdate({
          target: [
            payrollRecordsTable.clinicId,
            payrollRecordsTable.userId,
            payrollRecordsTable.periodYear,
            payrollRecordsTable.periodMonth,
          ],
          set: {
            approvedAmount: values.approvedAmount,
            status: "approved",
            approvedBy,
            approvedAt: new Date(),
            notes: values.notes,
            calculatedAmount: values.calculatedAmount,
            revenueBase: values.revenueBase,
          },
        })
        .returning();

      if (saved) upserted.push(saved);
    }

    const totalFot = employees.reduce((sum, e) => sum + e.approvedAmount, 0);

    const periodEndDate = new Date(year, month, 0);
    const payrollRef = `${year}-${String(month).padStart(2, "0")}`;

    const [expense] = await db
      .insert(clinicExpensesTable)
      .values({
        id: randomUUID(),
        clinicId,
        category: "salary",
        amount: String(totalFot),
        description: `ФОТ ${String(month).padStart(2, "0")}/${year} — ${employees.length} сотр.`,
        periodMonth: month,
        periodYear: year,
        payrollRef,
        createdBy: approvedBy,
        expenseDate: periodEndDate,
      })
      .onConflictDoUpdate({
        target: [
          clinicExpensesTable.clinicId,
          clinicExpensesTable.payrollRef,
          clinicExpensesTable.category,
        ],
        set: {
          amount: String(totalFot),
          description: `ФОТ ${String(month).padStart(2, "0")}/${year} — ${employees.length} сотр.`,
          createdBy: approvedBy,
          expenseDate: periodEndDate,
        },
      })
      .returning();

    return { records: upserted, expense, totalFot };
  }

  async getMySalary(userId: string, clinicId: string, year: number, month: number) {
    const settings = await this.getSalarySettings(userId, clinicId);
    const revenue = await this.getDoctorRevenueForPeriod(userId, clinicId, year, month);

    const salaryType = (settings?.salaryType ?? "fixed") as "fixed" | "commission" | "fixed_plus_commission";
    const fixedAmount = Number(settings?.fixedAmount ?? 0);
    const commissionPercent = Number(settings?.commissionPercent ?? 0);
    const calculatedSalary = this.calcSalary(salaryType, fixedAmount, commissionPercent, revenue);

    const [approvedRecord] = await db
      .select()
      .from(payrollRecordsTable)
      .where(
        and(
          eq(payrollRecordsTable.userId, userId),
          eq(payrollRecordsTable.clinicId, clinicId),
          eq(payrollRecordsTable.periodYear, year),
          eq(payrollRecordsTable.periodMonth, month),
        ),
      )
      .limit(1);

    const status = approvedRecord?.status ?? "pending";
    const approvedAmount = approvedRecord?.approvedAmount ? Number(approvedRecord.approvedAmount) : null;

    return {
      salaryType,
      fixedAmount,
      commissionPercent,
      revenueThisMonth: revenue,
      calculatedSalary,
      approvedAmount,
      status,
      period: { year, month },
    };
  }

  async listPayrollRecords(clinicId: string, userId?: string, year?: number, month?: number) {
    const conditions = [eq(payrollRecordsTable.clinicId, clinicId)];
    if (userId) conditions.push(eq(payrollRecordsTable.userId, userId));
    if (year) conditions.push(eq(payrollRecordsTable.periodYear, year));
    if (month) conditions.push(eq(payrollRecordsTable.periodMonth, month));

    return db
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
        notes: payrollRecordsTable.notes,
        createdAt: payrollRecordsTable.createdAt,
        userName: usersTable.name,
        userRole: usersTable.role,
      })
      .from(payrollRecordsTable)
      .leftJoin(usersTable, eq(payrollRecordsTable.userId, usersTable.id))
      .where(and(...conditions))
      .orderBy(
        desc(payrollRecordsTable.periodYear),
        desc(payrollRecordsTable.periodMonth),
      );
  }
}
