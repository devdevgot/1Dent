import { pgTable, pgEnum, text, timestamp, real } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";

export const clinicBranchesTable = pgTable("clinic_branches", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  radiusMeters: real("radius_meters").notNull().default(200),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ClinicBranch = typeof clinicBranchesTable.$inferSelect;
export type InsertClinicBranch = typeof clinicBranchesTable.$inferInsert;

export const geoEventTypeEnum = pgEnum("geo_event_type", ["checkin", "checkout"]);

export const geoEventsTable = pgTable("geo_events", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .notNull()
    .references(() => clinicBranchesTable.id, { onDelete: "cascade" }),
  eventType: geoEventTypeEnum("event_type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GeoEvent = typeof geoEventsTable.$inferSelect;
