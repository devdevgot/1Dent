import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

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

export type ClinicChannel = typeof clinicChannelsTable.$inferSelect;
export type InsertClinicChannel = typeof clinicChannelsTable.$inferInsert;
