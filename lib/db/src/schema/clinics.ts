import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clinicPlans = ["free", "starter", "professional", "enterprise"] as const;
export type ClinicPlan = (typeof clinicPlans)[number];

export const clinicsTable = pgTable("clinics", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  plan: text("plan", { enum: clinicPlans }).notNull().default("free"),
  whatsappPhone: text("whatsapp_phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClinicSchema = createInsertSchema(clinicsTable).omit({ createdAt: true });
export type InsertClinic = z.infer<typeof insertClinicSchema>;
export type Clinic = typeof clinicsTable.$inferSelect;
