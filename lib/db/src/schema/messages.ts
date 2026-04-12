import { pgTable, text, timestamp, boolean, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";
import { patientsTable } from "./patients";

export const messageDirectionEnum = pgEnum("message_direction", [
  "inbound",
  "outbound",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "red_alert",
  "new_message",
  "appointment",
  "system",
  "appointment_reminder",
]);

export const messagesTable = pgTable("messages", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  patientId: text("patient_id")
    .notNull()
    .references(() => patientsTable.id, { onDelete: "cascade" }),
  direction: messageDirectionEnum("direction").notNull(),
  senderId: text("sender_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  content: text("content").notNull(),
  whatsappMessageId: text("whatsapp_message_id"),
  isRedAlert: boolean("is_red_alert").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  patientId: text("patient_id").references(() => patientsTable.id, {
    onDelete: "set null",
  }),
  messageId: text("message_id").references(() => messagesTable.id, {
    onDelete: "set null",
  }),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Message = typeof messagesTable.$inferSelect;
export type InsertMessage = typeof messagesTable.$inferInsert;
export type MessageDirection =
  (typeof messageDirectionEnum.enumValues)[number];
export type Notification = typeof notificationsTable.$inferSelect;
export type InsertNotification = typeof notificationsTable.$inferInsert;
export type NotificationType =
  (typeof notificationTypeEnum.enumValues)[number];
