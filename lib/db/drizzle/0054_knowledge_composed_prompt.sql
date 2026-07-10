ALTER TABLE "knowledge_scripts"
  ADD COLUMN IF NOT EXISTS "composed_prompt" text;
--> statement-breakpoint
ALTER TABLE "knowledge_scripts"
  ADD COLUMN IF NOT EXISTS "composed_prompt_refined" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "knowledge_scripts"
  ADD COLUMN IF NOT EXISTS "composed_prompt_at" timestamp with time zone;
