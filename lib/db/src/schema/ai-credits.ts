import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";

export const aiCreditUsageTable = pgTable(
  "ai_credit_usage",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinicsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    feature: text("feature").notNull(),
    credits: integer("credits").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clinicCreatedIdx: index("ai_credit_usage_clinic_created_idx").on(
      table.clinicId,
      table.createdAt,
    ),
  }),
);

export type AiCreditUsage = typeof aiCreditUsageTable.$inferSelect;
export type InsertAiCreditUsage = typeof aiCreditUsageTable.$inferInsert;
