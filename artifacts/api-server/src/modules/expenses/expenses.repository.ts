import { db, clinicExpensesTable } from "@workspace/db";
import { eq, and, gte, lte, isNull, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface CreateExpenseInput {
  category: "salary" | "materials" | "rent" | "utilities" | "equipment" | "marketing" | "other";
  subcategory?: string;
  amount: number;
  description?: string;
  expenseDate: Date;
  periodMonth?: number;
  periodYear?: number;
}

export interface UpdateExpenseInput {
  category?: "salary" | "materials" | "rent" | "utilities" | "equipment" | "marketing" | "other";
  subcategory?: string;
  amount?: number;
  description?: string;
  expenseDate?: Date;
  periodMonth?: number;
  periodYear?: number;
}

export interface ExpenseFilters {
  dateFrom?: Date;
  dateTo?: Date;
  category?: string;
  periodMonth?: number;
  periodYear?: number;
}

export class ExpensesRepository {
  async listExpenses(clinicId: string, filters?: ExpenseFilters) {
    let query = db
      .select()
      .from(clinicExpensesTable)
      .where(eq(clinicExpensesTable.clinicId, clinicId));

    const conditions = [eq(clinicExpensesTable.clinicId, clinicId)];

    if (filters?.dateFrom) {
      conditions.push(gte(clinicExpensesTable.expenseDate, filters.dateFrom));
    }
    if (filters?.dateTo) {
      conditions.push(lte(clinicExpensesTable.expenseDate, filters.dateTo));
    }

    const rows = await db
      .select()
      .from(clinicExpensesTable)
      .where(and(...conditions))
      .orderBy(desc(clinicExpensesTable.expenseDate));

    return rows.filter((r) => {
      if (filters?.category && r.category !== filters.category) return false;
      if (filters?.periodMonth && r.periodMonth !== filters.periodMonth) return false;
      if (filters?.periodYear && r.periodYear !== filters.periodYear) return false;
      return true;
    });
  }

  async getExpenseById(id: string, clinicId: string) {
    const [row] = await db
      .select()
      .from(clinicExpensesTable)
      .where(and(eq(clinicExpensesTable.id, id), eq(clinicExpensesTable.clinicId, clinicId)))
      .limit(1);
    return row ?? null;
  }

  async createExpense(clinicId: string, createdBy: string, input: CreateExpenseInput) {
    const now = new Date();
    const month = input.expenseDate.getMonth() + 1;
    const year = input.expenseDate.getFullYear();
    const [row] = await db
      .insert(clinicExpensesTable)
      .values({
        id: randomUUID(),
        clinicId,
        category: input.category,
        subcategory: input.subcategory ?? null,
        amount: String(input.amount),
        description: input.description ?? null,
        expenseDate: input.expenseDate,
        periodMonth: input.periodMonth ?? month,
        periodYear: input.periodYear ?? year,
        createdBy,
        createdAt: now,
      })
      .returning();
    return row!;
  }

  async updateExpense(id: string, clinicId: string, input: UpdateExpenseInput) {
    const updates: Partial<typeof clinicExpensesTable.$inferInsert> = {};
    if (input.category !== undefined) updates.category = input.category;
    if (input.subcategory !== undefined) updates.subcategory = input.subcategory;
    if (input.amount !== undefined) updates.amount = String(input.amount);
    if (input.description !== undefined) updates.description = input.description;
    if (input.expenseDate !== undefined) {
      updates.expenseDate = input.expenseDate;
      if (!input.periodMonth) updates.periodMonth = input.expenseDate.getMonth() + 1;
      if (!input.periodYear) updates.periodYear = input.expenseDate.getFullYear();
    }
    if (input.periodMonth !== undefined) updates.periodMonth = input.periodMonth;
    if (input.periodYear !== undefined) updates.periodYear = input.periodYear;

    const [row] = await db
      .update(clinicExpensesTable)
      .set(updates)
      .where(and(eq(clinicExpensesTable.id, id), eq(clinicExpensesTable.clinicId, clinicId)))
      .returning();
    return row ?? null;
  }

  async deleteExpense(id: string, clinicId: string) {
    const [row] = await db
      .delete(clinicExpensesTable)
      .where(and(eq(clinicExpensesTable.id, id), eq(clinicExpensesTable.clinicId, clinicId)))
      .returning();
    return row ?? null;
  }

  async getTotalByPeriod(clinicId: string, periodYear: number, periodMonth: number) {
    const rows = await db
      .select()
      .from(clinicExpensesTable)
      .where(
        and(
          eq(clinicExpensesTable.clinicId, clinicId),
          eq(clinicExpensesTable.periodYear, periodYear),
          eq(clinicExpensesTable.periodMonth, periodMonth),
        ),
      );
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    const byCategory: Record<string, number> = {};
    for (const r of rows) {
      byCategory[r.category] = (byCategory[r.category] ?? 0) + Number(r.amount);
    }
    return { total, byCategory, rows };
  }
}
