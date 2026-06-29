import { pgTable, text, boolean, timestamp, jsonb, integer, uniqueIndex, pgEnum } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

export interface StepInstructions {
  general?: string;
  greeting?: string;
  collectName?: string;
  collectProblem?: string;
  suggestDoctor?: string;
  confirm?: string;
}

export interface ScriptBlock {
  id: string;
  title: string;
  icon: string;
  description: string;
  content: string;
  enabled: boolean;
  order: number;
}

export interface ScriptMindMapNode {
  id: string;
  label: string;
  content: string;
  isRoot?: boolean;
  fsmState?: string;
  position?: { x: number; y: number };
}

export interface ScriptMindMapEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface ScriptMindMapData {
  nodes: ScriptMindMapNode[];
  edges: ScriptMindMapEdge[];
}

export interface DaySchedule {
  /** 0=Sun … 6=Sat */
  day: number;
  enabled: boolean;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export interface ClinicCalendarConfig {
  slotDurationMinutes?: number;
  /** Minutes between appointments */
  bufferMinutes?: number;
  /** Default procedure length when blocking calendar */
  defaultAppointmentMinutes?: number;
  weeklySchedule?: DaySchedule[];
}

export interface ScriptVariant {
  id: string;
  name: string;
  /** Traffic weight 0–100; variants should sum to 100 when A/B enabled */
  weight: number;
  scriptBlocks?: ScriptBlock[];
  scriptMindMap?: ScriptMindMapData;
  stepInstructions?: StepInstructions;
  greetingTemplate?: string;
}

export const chatbotSettingsTable = pgTable("chatbot_settings", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .unique()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").default(true).notNull(),
  greetingTemplate: text("greeting_template")
    .notNull()
    .default("Здравствуйте! Я AI-ассистент стоматологической клиники. Для записи к врачу введите ваш ИИН (12 цифр)."),
  followup24hTemplate: text("followup_24h_template")
    .notNull()
    .default(
      "Дорогой пациент! Прошло 3 часа после вашей процедуры. Как вы себя чувствуете? Если есть вопросы — обращайтесь.",
    ),
  followup72hTemplate: text("followup_72h_template")
    .notNull()
    .default(
      "Прошло 3 дня после процедуры. Надеемся, вы чувствуете себя хорошо. Помните о рекомендациях врача.",
    ),
  followup168hTemplate: text("followup_168h_template")
    .notNull()
    .default(
      "Прошла неделя после вашей процедуры. Не забудьте о плановом осмотре. Ждём вас в клинике!",
    ),
  stepInstructions: jsonb("step_instructions").$type<StepInstructions>().default({}),
  scriptBlocks: jsonb("script_blocks").$type<ScriptBlock[]>().default([]),
  scriptMindMap: jsonb("script_mind_map").$type<ScriptMindMapData>().default({ nodes: [], edges: [] }),
  calendarConfig: jsonb("calendar_config").$type<ClinicCalendarConfig>().default({}),
  abTestEnabled: boolean("ab_test_enabled").default(false).notNull(),
  scriptVariants: jsonb("script_variants").$type<ScriptVariant[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chatbotFunnelEventsTable = pgTable("chatbot_funnel_events", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  sessionId: text("session_id"),
  variantId: text("variant_id"),
  eventType: text("event_type").notNull(),
  fromState: text("from_state"),
  toState: text("to_state"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chatbotSessionsTable = pgTable(
  "chatbot_sessions",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinicsTable.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    state: text("state").notNull().default("greeting"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    humanTakeover: boolean("human_takeover").default(false).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clinicPhoneUniqueIdx: uniqueIndex("chatbot_sessions_clinic_phone_idx").on(t.clinicId, t.phone),
  }),
);

export const chatbotMessageDirectionEnum = pgEnum("chatbot_message_direction", ["inbound", "outbound"]);

export const chatbotMessagesTable = pgTable("chatbot_messages", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  direction: chatbotMessageDirectionEnum("direction").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chatbotManagerExamplesTable = pgTable("chatbot_manager_examples", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  userMessage: text("user_message").notNull(),
  managerResponse: text("manager_response").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ChatbotSettings = typeof chatbotSettingsTable.$inferSelect;
export type InsertChatbotSettings = typeof chatbotSettingsTable.$inferInsert;
export type ChatbotSession = typeof chatbotSessionsTable.$inferSelect;
export type InsertChatbotSession = typeof chatbotSessionsTable.$inferInsert;
export type ChatbotMessage = typeof chatbotMessagesTable.$inferSelect;
export type InsertChatbotMessage = typeof chatbotMessagesTable.$inferInsert;
export type ChatbotManagerExample = typeof chatbotManagerExamplesTable.$inferSelect;
export type InsertChatbotManagerExample = typeof chatbotManagerExamplesTable.$inferInsert;
export type ChatbotFunnelEvent = typeof chatbotFunnelEventsTable.$inferSelect;
export type InsertChatbotFunnelEvent = typeof chatbotFunnelEventsTable.$inferInsert;
