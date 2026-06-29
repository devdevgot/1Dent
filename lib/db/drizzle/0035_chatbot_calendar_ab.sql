ALTER TABLE "chatbot_settings" ADD COLUMN IF NOT EXISTS "calendar_config" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "chatbot_settings" ADD COLUMN IF NOT EXISTS "ab_test_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "chatbot_settings" ADD COLUMN IF NOT EXISTS "script_variants" jsonb DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "chatbot_funnel_events" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL REFERENCES "clinics"("id") ON DELETE CASCADE,
  "phone" text NOT NULL,
  "session_id" text,
  "variant_id" text,
  "event_type" text NOT NULL,
  "from_state" text,
  "to_state" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chatbot_funnel_clinic_created_idx"
  ON "chatbot_funnel_events" ("clinic_id", "created_at");
