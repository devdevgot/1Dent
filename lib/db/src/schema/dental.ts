import { pgTable, text, timestamp, integer, pgEnum, real, boolean } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";
import { patientsTable } from "./patients";

export const CONDITION_MKB10: Record<string, string> = {
  healthy: "Z01.2",
  cavity: "K02.1",
  treated: "Z98.8",
  crown: "Z96.6",
  root_canal: "K04.0",
  implant: "Z96.5",
  missing: "K08.1",
  extraction_needed: "K08.1",
};

export const CONDITION_DEFAULT_PRICES: Record<string, number> = {
  healthy: 0,
  cavity: 15000,
  treated: 8000,
  crown: 60000,
  root_canal: 45000,
  implant: 120000,
  missing: 0,
  extraction_needed: 12000,
};

export const toothConditionEnum = pgEnum("tooth_condition", [
  "healthy",
  "cavity",
  "treated",
  "crown",
  "root_canal",
  "implant",
  "missing",
  "extraction_needed",
]);

export const inventoryCategoryEnum = pgEnum("inventory_category", [
  "materials",
  "instruments",
  "medications",
  "consumables",
  "prosthetics",
  "implants",
  "other",
]);

export const toothRecordsTable = pgTable("tooth_records", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  patientId: text("patient_id")
    .notNull()
    .references(() => patientsTable.id, { onDelete: "cascade" }),
  toothFdi: integer("tooth_fdi").notNull(),
  condition: toothConditionEnum("condition").default("healthy").notNull(),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedBy: text("updated_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
});

export const inventoryItemsTable = pgTable("inventory_items", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: inventoryCategoryEnum("category").default("other").notNull(),
  unit: text("unit").notNull().default("шт"),
  unitPrice: real("unit_price").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const inventoryStockTable = pgTable("inventory_stock", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  itemId: text("item_id")
    .notNull()
    .references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
  quantity: real("quantity").notNull().default(0),
  minQuantity: real("min_quantity").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const toothTaskTypeEnum = pgEnum("tooth_task_type", [
  "treatment",
  "extraction",
]);

export const toothTaskStatusEnum = pgEnum("tooth_task_status", [
  "in_progress",
  "done",
]);

export const toothTreatmentsTable = pgTable("tooth_treatments", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  patientId: text("patient_id")
    .notNull()
    .references(() => patientsTable.id, { onDelete: "cascade" }),
  toothFdi: integer("tooth_fdi").notNull(),
  itemId: text("item_id").references(() => inventoryItemsTable.id, {
    onDelete: "set null",
  }),
  description: text("description").notNull(),
  type: toothTaskTypeEnum("type").default("treatment").notNull(),
  status: toothTaskStatusEnum("status").default("in_progress").notNull(),
  quantityUsed: real("quantity_used").default(1),
  performedBy: text("performed_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  performedAt: timestamp("performed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const clinicConditionPricesTable = pgTable("clinic_condition_prices", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  condition: toothConditionEnum("condition").notNull(),
  price: real("price").notNull().default(0),
  mkb10Code: text("mkb10_code"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ToothRecord = typeof toothRecordsTable.$inferSelect;
export type InsertToothRecord = typeof toothRecordsTable.$inferInsert;
export type ToothCondition = (typeof toothConditionEnum.enumValues)[number];
export type InventoryItem = typeof inventoryItemsTable.$inferSelect;
export type InsertInventoryItem = typeof inventoryItemsTable.$inferInsert;
export type InventoryCategory = (typeof inventoryCategoryEnum.enumValues)[number];
export type InventoryStock = typeof inventoryStockTable.$inferSelect;
export type ToothTreatment = typeof toothTreatmentsTable.$inferSelect;
export type InsertToothTreatment = typeof toothTreatmentsTable.$inferInsert;
export type ToothTaskType = (typeof toothTaskTypeEnum.enumValues)[number];
export type ToothTaskStatus = (typeof toothTaskStatusEnum.enumValues)[number];
export type ClinicConditionPrice = typeof clinicConditionPricesTable.$inferSelect;

export const treatmentPlanStatusEnum = pgEnum("treatment_plan_status", [
  "draft",
  "approved",
  "in_progress",
  "completed",
]);

export const treatmentPlanItemStatusEnum = pgEnum("treatment_plan_item_status", [
  "pending",
  "completed",
  "cancelled",
]);

export const treatmentPlansTable = pgTable("treatment_plans", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  patientId: text("patient_id")
    .notNull()
    .references(() => patientsTable.id, { onDelete: "cascade" }),
  doctorId: text("doctor_id").references(() => usersTable.id, { onDelete: "set null" }),
  status: treatmentPlanStatusEnum("status").default("draft").notNull(),
  notes: text("notes"),
  totalCost: real("total_cost").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const treatmentPlanItemsTable = pgTable("treatment_plan_items", {
  id: text("id").primaryKey(),
  planId: text("plan_id")
    .notNull()
    .references(() => treatmentPlansTable.id, { onDelete: "cascade" }),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  patientId: text("patient_id")
    .notNull()
    .references(() => patientsTable.id, { onDelete: "cascade" }),
  toothFdi: integer("tooth_fdi"),
  condition: toothConditionEnum("condition"),
  mkb10Code: text("mkb10_code"),
  title: text("title").notNull(),
  price: real("price").notNull().default(0),
  status: treatmentPlanItemStatusEnum("status").default("pending").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  procedureId: text("procedure_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type TreatmentPlan = typeof treatmentPlansTable.$inferSelect;
export type InsertTreatmentPlan = typeof treatmentPlansTable.$inferInsert;
export type TreatmentPlanStatus = (typeof treatmentPlanStatusEnum.enumValues)[number];
export type TreatmentPlanItem = typeof treatmentPlanItemsTable.$inferSelect;
export type InsertTreatmentPlanItem = typeof treatmentPlanItemsTable.$inferInsert;
export type TreatmentPlanItemStatus = (typeof treatmentPlanItemStatusEnum.enumValues)[number];
