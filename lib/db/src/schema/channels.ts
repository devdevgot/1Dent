import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { patientsTable } from "./patients";

export const channelTypes = [
  "instagram",
  "telegram",
  "2gis",
  "website",
  "whatsapp",
  "referral",
  "other",
] as const;

export type ChannelType = (typeof channelTypes)[number];

export const clinicChannelsTable = pgTable("clinic_channels", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", { enum: channelTypes }).notNull().default("other"),
  refCode: text("ref_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const channelClicksTable = pgTable("channel_clicks", {
  id: text("id").primaryKey(),
  channelId: text("channel_id")
    .notNull()
    .references(() => clinicChannelsTable.id, { onDelete: "cascade" }),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  ip: text("ip"),
  userAgent: text("user_agent"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmContent: text("utm_content"),
  utmTerm: text("utm_term"),
  patientId: text("patient_id").references(() => patientsTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ClinicChannel = typeof clinicChannelsTable.$inferSelect;
export type InsertClinicChannel = typeof clinicChannelsTable.$inferInsert;
export type ChannelClick = typeof channelClicksTable.$inferSelect;
export type InsertChannelClick = typeof channelClicksTable.$inferInsert;
