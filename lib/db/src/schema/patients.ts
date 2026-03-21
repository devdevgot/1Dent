import { pgTable, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";

export const patientStatusEnum = pgEnum("patient_status", [
  "new_request",
  "initial_consultation",
  "diagnostics",
  "treatment_assigned",
  "treatment_in_progress",
  "post_op_monitoring",
  "completed",
]);

export const patientSourceEnum = pgEnum("patient_source", [
  "instagram",
  "referral",
  "walk_in",
  "website",
  "whatsapp",
  "other",
]);

export const interactionTypeEnum = pgEnum("interaction_type", [
  "note",
  "call",
  "whatsapp",
  "status_change",
  "appointment",
]);

export const patientsTable = pgTable("patients", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  doctorId: text("doctor_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  age: integer("age"),
  source: patientSourceEnum("source").default("other").notNull(),
  status: patientStatusEnum("status").default("new_request").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const patientInteractionsTable = pgTable("patient_interactions", {
  id: text("id").primaryKey(),
  patientId: text("patient_id")
    .notNull()
    .references(() => patientsTable.id, { onDelete: "cascade" }),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  type: interactionTypeEnum("type").default("note").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Patient = typeof patientsTable.$inferSelect;
export type InsertPatient = typeof patientsTable.$inferInsert;
export type PatientStatus = (typeof patientStatusEnum.enumValues)[number];
export type PatientSource = (typeof patientSourceEnum.enumValues)[number];
export type PatientInteraction = typeof patientInteractionsTable.$inferSelect;
export type InsertPatientInteraction =
  typeof patientInteractionsTable.$inferInsert;
export type InteractionType = (typeof interactionTypeEnum.enumValues)[number];
