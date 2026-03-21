import { pgTable, text, timestamp, integer, pgEnum, real, boolean } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";
import { patientsTable } from "./patients";

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
  quantityUsed: real("quantity_used").default(1),
  performedBy: text("performed_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  performedAt: timestamp("performed_at", { withTimezone: true })
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
