import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clinicPlans = ["free", "starter", "professional", "enterprise"] as const;
export type ClinicPlan = (typeof clinicPlans)[number];

export const clinicsTable = pgTable("clinics", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  plan: text("plan", { enum: clinicPlans }).notNull().default("free"),
  isActive: boolean("is_active").notNull().default(true),
  parentClinicId: text("parent_clinic_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  whatsappPhone: text("whatsapp_phone"),
  greenApiInstanceId: text("green_api_instance_id"),
  greenApiToken: text("green_api_token"),
  greenApiUrl: text("green_api_url"),
  telegramBotToken: text("telegram_bot_token"),
  telegramOwnerChatId: text("telegram_owner_chat_id"),
  telegramConnectToken: text("telegram_connect_token"),
  telegramPlatformChatId: text("telegram_platform_chat_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClinicSchema = createInsertSchema(clinicsTable).omit({ createdAt: true });
export type InsertClinic = z.infer<typeof insertClinicSchema>;
export type Clinic = typeof clinicsTable.$inferSelect;
