import { pgTable, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

export interface ScriptNode {
  id: string;
  label: string;
  detail?: string;
  children?: ScriptNode[];
}

export interface GeneratedScript {
  title: string;
  nodes: ScriptNode[];
}

export const knowledgeSourcesTable = pgTable("knowledge_sources", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  name: text("name").notNull(),
  url: text("url"),
  storageKey: text("storage_key"),
  extractedText: text("extracted_text"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const knowledgeScriptsTable = pgTable("knowledge_scripts", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id")
    .notNull()
    .unique()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  primaryScript: jsonb("primary_script").$type<GeneratedScript>(),
  repeatScript: jsonb("repeat_script").$type<GeneratedScript>(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  composedPrompt: text("composed_prompt"),
  composedPromptRefined: boolean("composed_prompt_refined").notNull().default(false),
  composedPromptAt: timestamp("composed_prompt_at", { withTimezone: true }),
});

export type KnowledgeSource = typeof knowledgeSourcesTable.$inferSelect;
export type KnowledgeScript = typeof knowledgeScriptsTable.$inferSelect;
