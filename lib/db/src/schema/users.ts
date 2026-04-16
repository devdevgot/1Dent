import { pgTable, text, timestamp, pgEnum, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

export const userRoleEnum = pgEnum("user_role", [
  "owner",
  "admin",
  "doctor",
  "accountant",
  "warehouse",
]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("doctor"),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export type UserRole = "owner" | "admin" | "doctor" | "accountant" | "warehouse";

export const doctorCapacityTable = pgTable("doctor_capacity", {
  doctorId: text("doctor_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  maxPatientsPerDay: integer("max_patients_per_day").notNull().default(20),
});

export type DoctorCapacity = typeof doctorCapacityTable.$inferSelect;
