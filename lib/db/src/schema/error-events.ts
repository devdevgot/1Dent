import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";

export const errorEventSources = ["api", "dental-crm", "tg-admin", "worker"] as const;
export type ErrorEventSource = (typeof errorEventSources)[number];

export const errorEventSeverities = ["error", "warning", "fatal"] as const;
export type ErrorEventSeverity = (typeof errorEventSeverities)[number];

export const errorEventsTable = pgTable("error_events", {
  id: text("id").primaryKey(),
  source: text("source", { enum: errorEventSources }).notNull(),
  severity: text("severity", { enum: errorEventSeverities }).notNull().default("error"),
  message: text("message").notNull(),
  stack: text("stack"),
  code: text("code"),
  clinicId: text("clinic_id").references(() => clinicsTable.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  requestId: text("request_id"),
  url: text("url"),
  method: text("method"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
  fingerprint: text("fingerprint"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ErrorEvent = typeof errorEventsTable.$inferSelect;
export type InsertErrorEvent = typeof errorEventsTable.$inferInsert;
