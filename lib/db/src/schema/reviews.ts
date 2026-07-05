import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { patientsTable } from "./patients";
import { usersTable } from "./users";
import { proceduresTable } from "./procedures";

export const patientReviewsTable = pgTable("patient_reviews", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  patientId: text("patient_id")
    .notNull()
    .references(() => patientsTable.id, { onDelete: "cascade" }),
  doctorId: text("doctor_id").references(() => usersTable.id, { onDelete: "set null" }),
  procedureId: text("procedure_id").references(() => proceduresTable.id, { onDelete: "set null" }),
  score: integer("score").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const processedWebhookMessagesTable = pgTable("processed_webhook_messages", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  whatsappMessageId: text("whatsapp_message_id").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PatientReview = typeof patientReviewsTable.$inferSelect;
export type InsertPatientReview = typeof patientReviewsTable.$inferInsert;
