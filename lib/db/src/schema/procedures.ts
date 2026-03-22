import {
  pgTable,
  text,
  timestamp,
  real,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";
import { patientsTable } from "./patients";
import { inventoryItemsTable } from "./dental";

export const procedureStatusEnum = pgEnum("procedure_status", [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);

export const proceduresTable = pgTable("procedures", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  patientId: text("patient_id")
    .notNull()
    .references(() => patientsTable.id, { onDelete: "cascade" }),
  doctorId: text("doctor_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  status: procedureStatusEnum("status").default("scheduled").notNull(),
  price: real("price").notNull().default(0),
  notes: text("notes"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const procedureTemplatesTable = pgTable("procedure_templates", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  defaultPrice: real("default_price").notNull().default(0),
  materials: text("materials").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const procedureMaterialsTable = pgTable("procedure_materials", {
  id: text("id").primaryKey(),
  procedureId: text("procedure_id")
    .notNull()
    .references(() => proceduresTable.id, { onDelete: "cascade" }),
  inventoryItemId: text("inventory_item_id")
    .notNull()
    .references(() => inventoryItemsTable.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const doctorKpisTable = pgTable("doctor_kpis", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  doctorId: text("doctor_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  patientsCount: integer("patients_count").notNull().default(0),
  proceduresCount: integer("procedures_count").notNull().default(0),
  revenueTotal: real("revenue_total").notNull().default(0),
  computedAt: timestamp("computed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Procedure = typeof proceduresTable.$inferSelect;
export type InsertProcedure = typeof proceduresTable.$inferInsert;
export type ProcedureStatus = (typeof procedureStatusEnum.enumValues)[number];
export type ProcedureTemplate = typeof procedureTemplatesTable.$inferSelect;
export type InsertProcedureTemplate =
  typeof procedureTemplatesTable.$inferInsert;
export type ProcedureMaterial = typeof procedureMaterialsTable.$inferSelect;
export type InsertProcedureMaterial =
  typeof procedureMaterialsTable.$inferInsert;
export type DoctorKpiRecord = typeof doctorKpisTable.$inferSelect;
export type InsertDoctorKpiRecord = typeof doctorKpisTable.$inferInsert;
