import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

export const platformPushBroadcastsTable = pgTable("platform_push_broadcasts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  url: text("url"),
  clinicId: text("clinic_id").references(() => clinicsTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("sent"),
  recipientCount: integer("recipient_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  createdByTgId: text("created_by_tg_id"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PlatformPushBroadcast = typeof platformPushBroadcastsTable.$inferSelect;
export type InsertPlatformPushBroadcast = typeof platformPushBroadcastsTable.$inferInsert;
