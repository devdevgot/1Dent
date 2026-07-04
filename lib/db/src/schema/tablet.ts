import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";

export const tabletSessionStatusEnum = pgEnum("tablet_session_status", [
  "pending",
  "unlocked",
  "expired",
]);

export const tabletCabinetsTable = pgTable("tablet_cabinets", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  pinHash: text("pin_hash"),
  pairingCode: text("pairing_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tabletSessionsTable = pgTable("tablet_sessions", {
  id: text("id").primaryKey(),
  cabinetId: text("cabinet_id")
    .notNull()
    .references(() => tabletCabinetsTable.id, { onDelete: "cascade" }),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  linkTokenHash: text("link_token_hash").notNull(),
  status: tabletSessionStatusEnum("status").notNull().default("pending"),
  doctorUserId: text("doctor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TabletCabinet = typeof tabletCabinetsTable.$inferSelect;
export type TabletSession = typeof tabletSessionsTable.$inferSelect;
