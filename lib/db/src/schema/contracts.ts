import { pgTable, text, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { patientsTable } from "./patients";
import { usersTable } from "./users";

export const contractStatusEnum = pgEnum("contract_status", [
  "sent",
  "viewed",
  "signed",
]);

/**
 * Contract templates uploaded by the clinic (DOCX or PDF).
 * fieldMappings: JSON array of { placeholder, patientField, label }
 */
export const contractTemplatesTable = pgTable("contract_templates", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type").notNull().default("docx"),
  extractedText: text("extracted_text"),
  fieldMappings: jsonb("field_mappings").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Instances of a contract sent to a specific patient.
 * filledData: JSON record of { patientField: resolvedValue }
 * token: unique token for the public page URL
 */
export const patientContractsTable = pgTable("patient_contracts", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  patientId: text("patient_id")
    .notNull()
    .references(() => patientsTable.id, { onDelete: "cascade" }),
  templateId: text("template_id")
    .notNull()
    .references(() => contractTemplatesTable.id, { onDelete: "restrict" }),
  sentById: text("sent_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  token: text("token").notNull().unique(),
  renderedHtml: text("rendered_html"),
  filledData: jsonb("filled_data").notNull().default("{}"),
  status: contractStatusEnum("status").notNull().default("sent"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signedIp: text("signed_ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ContractTemplate = typeof contractTemplatesTable.$inferSelect;
export type InsertContractTemplate = typeof contractTemplatesTable.$inferInsert;
export type PatientContract = typeof patientContractsTable.$inferSelect;
export type InsertPatientContract = typeof patientContractsTable.$inferInsert;
export type ContractStatus = (typeof contractStatusEnum.enumValues)[number];

export interface FieldMapping {
  placeholder: string;
  patientField: string;
  label: string;
}
