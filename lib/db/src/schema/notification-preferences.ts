import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";

/** Preference groups the user can mute in Account → Push settings. */
export type NotificationPrefGroup =
  | "chats"
  | "appointments"
  | "payments"
  | "alerts"
  | "operations"
  | "reviews"
  | "contracts"
  | "broadcasts"
  | "stages"
  | "treatment";

export const NOTIFICATION_PREF_GROUPS: NotificationPrefGroup[] = [
  "chats",
  "appointments",
  "payments",
  "alerts",
  "operations",
  "reviews",
  "contracts",
  "broadcasts",
  "stages",
  "treatment",
];

export const notificationPreferencesTable = pgTable("notification_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  /** Groups the user has muted (opt-out). Missing group = enabled (role defaults still apply). */
  mutedGroups: jsonb("muted_groups").$type<NotificationPrefGroup[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationPreference = typeof notificationPreferencesTable.$inferSelect;
export type InsertNotificationPreference = typeof notificationPreferencesTable.$inferInsert;
