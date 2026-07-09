import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const landingLeadsTable = pgTable("landing_leads", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  clinicName: text("clinic_name").notNull(),
  status: text("status").notNull().default("new"),
  source: text("source").notNull().default("landing"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LandingLead = typeof landingLeadsTable.$inferSelect;
export type InsertLandingLead = typeof landingLeadsTable.$inferInsert;
