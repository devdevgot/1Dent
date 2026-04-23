import {
  pgTable,
  text,
  timestamp,
  numeric,
  integer,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";

export const salaryTypeEnum = pgEnum("salary_type", [
  "fixed",
  "commission",
  "fixed_plus_commission",
]);

export const payrollStatusEnum = pgEnum("payroll_status", [
  "pending",
  "approved",
  "paid",
]);

export const expenseCategoryEnum = pgEnum("expense_category", [
  "salary",
  "materials",
  "rent",
  "utilities",
  "equipment",
  "marketing",
  "other",
]);

export const userSalarySettingsTable = pgTable("user_salary_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  salaryType: salaryTypeEnum("salary_type").notNull().default("fixed"),
  fixedAmount: numeric("fixed_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  commissionPercent: numeric("commission_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type UserSalarySettings =
  typeof userSalarySettingsTable.$inferSelect;

export const payrollRecordsTable = pgTable(
  "payroll_records",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinicsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    periodMonth: integer("period_month").notNull(),
    periodYear: integer("period_year").notNull(),
    salaryType: salaryTypeEnum("salary_type").notNull(),
    fixedAmount: numeric("fixed_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    commissionPercent: numeric("commission_percent", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    revenueBase: numeric("revenue_base", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    calculatedAmount: numeric("calculated_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    approvedAmount: numeric("approved_amount", { precision: 12, scale: 2 }),
    status: payrollStatusEnum("status").notNull().default("pending"),
    approvedBy: text("approved_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("payroll_records_unique_period").on(
      t.clinicId,
      t.userId,
      t.periodYear,
      t.periodMonth,
    ),
  ],
);

export type PayrollRecord = typeof payrollRecordsTable.$inferSelect;

export const clinicExpensesTable = pgTable(
  "clinic_expenses",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinicsTable.id, { onDelete: "cascade" }),
    category: expenseCategoryEnum("category").notNull().default("other"),
    subcategory: text("subcategory"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
    description: text("description"),
    expenseDate: timestamp("expense_date", { withTimezone: true })
      .notNull()
      .defaultNow(),
    periodMonth: integer("period_month"),
    periodYear: integer("period_year"),
    payrollRef: text("payroll_ref"),
    createdBy: text("created_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("clinic_expenses_payroll_unique")
      .on(t.clinicId, t.payrollRef, t.category)
      .where(sql`payroll_ref IS NOT NULL`),
  ],
);

export type ClinicExpense = typeof clinicExpensesTable.$inferSelect;
