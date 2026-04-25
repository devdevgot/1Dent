import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";
import { proceduresTable } from "./procedures";

export const doctorHandoffsTable = pgTable("doctor_handoffs", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  fromDoctorId: text("from_doctor_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  toDoctorId: text("to_doctor_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  procedureId: text("procedure_id")
    .references(() => proceduresTable.id, { onDelete: "set null" }),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DoctorHandoff = typeof doctorHandoffsTable.$inferSelect;
export type InsertDoctorHandoff = typeof doctorHandoffsTable.$inferInsert;
