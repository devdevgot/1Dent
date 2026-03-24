import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

export interface MigrationReport {
  errors: Array<{ row: number; message: string }>;
  duplicates: Array<{ phone: string; name?: string }>;
}

export const migrationJobsTable = pgTable("migration_jobs", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  totalRows: integer("total_rows").default(0),
  processedRows: integer("processed_rows").default(0),
  successCount: integer("success_count").default(0),
  errorCount: integer("error_count").default(0),
  duplicateCount: integer("duplicate_count").default(0),
  report: jsonb("report").$type<MigrationReport>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MigrationJob = typeof migrationJobsTable.$inferSelect;
export type InsertMigrationJob = typeof migrationJobsTable.$inferInsert;
