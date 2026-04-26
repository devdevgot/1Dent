ALTER TABLE "chatbot_settings" ADD COLUMN IF NOT EXISTS "step_instructions" jsonb DEFAULT '{}';

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chatbot_manager_examples" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL REFERENCES "clinics"("id") ON DELETE CASCADE,
  "user_message" text NOT NULL,
  "manager_response" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chatbot_manager_examples_clinic_idx" ON "chatbot_manager_examples" ("clinic_id", "sort_order");
