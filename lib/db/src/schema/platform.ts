import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const platformAdminsTable = pgTable("platform_admins", {
  id: text("id").primaryKey(),
  telegramUserId: text("telegram_user_id").notNull().unique(),
  name: text("name").notNull(),
  addedBy: text("added_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformAdmin = typeof platformAdminsTable.$inferSelect;
export type InsertPlatformAdmin = typeof platformAdminsTable.$inferInsert;
