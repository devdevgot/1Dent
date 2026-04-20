CREATE TABLE IF NOT EXISTS "channel_clicks" (
  "id" text PRIMARY KEY NOT NULL,
  "channel_id" text NOT NULL REFERENCES "clinic_channels"("id") ON DELETE CASCADE,
  "clinic_id" text NOT NULL REFERENCES "clinics"("id") ON DELETE CASCADE,
  "ip" text,
  "user_agent" text,
  "utm_source" text,
  "utm_medium" text,
  "utm_campaign" text,
  "utm_content" text,
  "utm_term" text,
  "patient_id" text REFERENCES "patients"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "channel_clicks_channel_idx" ON "channel_clicks" ("channel_id");
CREATE INDEX IF NOT EXISTS "channel_clicks_clinic_idx" ON "channel_clicks" ("clinic_id", "created_at");
