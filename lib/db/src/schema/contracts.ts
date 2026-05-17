import { pgTable, text, timestamp, jsonb, pgEnum, boolean } from "drizzle-orm/pg-core";
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
 * isSystem: true for built-in system templates (extraction bundle)
 * systemType: identifies which system template (e.g. "extraction_contract")
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
  isSystem: boolean("is_system").notNull().default(false),
  systemType: text("system_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Instances of a contract sent to a specific patient.
 * filledData: JSON record of { patientField: resolvedValue }
 * token: unique token for the public page URL
 * bundleToken: shared across all contracts sent together as a bundle
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
  bundleToken: text("bundle_token"),
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
