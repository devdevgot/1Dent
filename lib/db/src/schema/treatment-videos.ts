import { pgTable, text, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

export const treatmentVideosTable = pgTable("treatment_videos", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").references(() => clinicsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category").notNull(),
  storageKey: text("storage_key").notNull(),
  thumbnailKey: text("thumbnail_key"),
  durationSec: integer("duration_sec"),
  relatedConditions: jsonb("related_conditions").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TreatmentVideo = typeof treatmentVideosTable.$inferSelect;
export type NewTreatmentVideo = typeof treatmentVideosTable.$inferInsert;
