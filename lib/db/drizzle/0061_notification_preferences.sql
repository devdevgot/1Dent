CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "clinic_id" text NOT NULL REFERENCES "clinics"("id") ON DELETE CASCADE,
  "muted_groups" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "notification_preferences_clinic_idx"
  ON "notification_preferences" ("clinic_id");
