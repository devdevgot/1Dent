import { pgTable, text, boolean, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

/** Editable WhatsApp templates + AI system prompts per Care scenario. */
export type CustomerCarePromptPack = {
  leadNurtureTemplates: [string, string, string];
  leadNurturePrompts: [string, string, string];
  reminder24hTemplate: string;
  reminder24hPrompt: string;
  reminder1hTemplate: string;
  reminder1hPrompt: string;
  noShowTemplate: string;
  noShowPrompt: string;
  postVisitTemplates: [string, string];
  postVisitPrompts: [string, string];
  upsellTemplate: string;
  upsellPrompt: string;
  /** When patient agrees to book — hand off to main booking chatbot. */
  handoffToBookingPrompt: string;
};

export const customerCareSettingsTable = pgTable("customer_care_settings", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .unique()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").default(false).notNull(),
  leadNurtureEnabled: boolean("lead_nurture_enabled").default(true).notNull(),
  leadNurtureDelaysMinutes: jsonb("lead_nurture_delays_minutes")
    .$type<[number, number, number]>()
    .default([25, 150, 1440])
    .notNull(),
  reminder1hEnabled: boolean("reminder_1h_enabled").default(true).notNull(),
  reminder24hEnabled: boolean("reminder_24h_enabled").default(true).notNull(),
  noShowEnabled: boolean("no_show_enabled").default(true).notNull(),
  noShowGraceHours: integer("no_show_grace_hours").default(2).notNull(),
  postVisitEnabled: boolean("post_visit_enabled").default(true).notNull(),
  upsellEnabled: boolean("upsell_enabled").default(true).notNull(),
  /**
   * Booking strategy when patient agrees after a Care message:
   * always handoff_to_booking — main chatbot owns doctor/slots/finalize.
   */
  bookingMode: text("booking_mode").default("handoff_to_booking").notNull(),
  prompts: jsonb("prompts").$type<CustomerCarePromptPack>().notNull().default({} as CustomerCarePromptPack),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CustomerCareSettingsRow = typeof customerCareSettingsTable.$inferSelect;
export type InsertCustomerCareSettings = typeof customerCareSettingsTable.$inferInsert;
