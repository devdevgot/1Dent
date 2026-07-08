import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
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
  planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
  aiBonusCredits: integer("ai_bonus_credits").notNull().default(0),
  whatsappPhone: text("whatsapp_phone"),
  greenApiInstanceId: text("green_api_instance_id"),
  greenApiToken: text("green_api_token"),
  greenApiUrl: text("green_api_url"),
  greenApiWebhookSecret: text("green_api_webhook_secret"),
  timezone: text("timezone").notNull().default("Asia/Almaty"),
  telegramBotToken: text("telegram_bot_token"),
  telegramOwnerChatId: text("telegram_owner_chat_id"),
  telegramConnectToken: text("telegram_connect_token"),
  telegramPlatformChatId: text("telegram_platform_chat_id"),
  contractLegalName: text("contract_legal_name"),
  contractCity: text("contract_city"),
  contractAddress: text("contract_address"),
  contractLicense: text("contract_license"),
  contractDirector: text("contract_director"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClinicSchema = createInsertSchema(clinicsTable).omit({ createdAt: true });
export type InsertClinic = z.infer<typeof insertClinicSchema>;
export type Clinic = typeof clinicsTable.$inferSelect;
