import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  integer,
} from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";
import { patientsTable } from "./patients";
import { proceduresTable } from "./procedures";

export const followupStatusEnum = pgEnum("followup_status", [
  "pending",
  "sent",
  "cancelled",
]);

export const actionLogsTable = pgTable("action_logs", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  actionType: text("action_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const postopFollowupsTable = pgTable("postop_followups", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  patientId: text("patient_id")
    .notNull()
    .references(() => patientsTable.id, { onDelete: "cascade" }),
  procedureId: text("procedure_id")
    .notNull()
    .references(() => proceduresTable.id, { onDelete: "cascade" }),
  sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
  status: followupStatusEnum("status").notNull().default("pending"),
  messageTemplate: text("message_template").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const appointmentRemindersTable = pgTable("appointment_reminders", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  patientId: text("patient_id")
    .notNull()
    .references(() => patientsTable.id, { onDelete: "cascade" }),
  procedureId: text("procedure_id")
    .notNull()
    .references(() => proceduresTable.id, { onDelete: "cascade" }),
  sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
  status: followupStatusEnum("status").notNull().default("pending"),
  reminderType: text("reminder_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ActionLog = typeof actionLogsTable.$inferSelect;
export type PostopFollowup = typeof postopFollowupsTable.$inferSelect;
export type AppointmentReminder = typeof appointmentRemindersTable.$inferSelect;

export const adminBroadcastStatusEnum = pgEnum("admin_broadcast_status", [
  "draft", "scheduled", "sending", "sent", "cancelled", "failed",
]);

export const adminBroadcastsTable = pgTable("admin_broadcasts", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").references(() => clinicsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  status: adminBroadcastStatusEnum("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminBroadcast = typeof adminBroadcastsTable.$inferSelect;
