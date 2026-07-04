ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tablet_pin_hash" text;

DO $$ BEGIN
  CREATE TYPE "tablet_session_status" AS ENUM ('pending', 'unlocked', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "tablet_cabinets" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL REFERENCES "clinics"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "pin_hash" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "tablet_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "cabinet_id" text NOT NULL REFERENCES "tablet_cabinets"("id") ON DELETE CASCADE,
  "clinic_id" text NOT NULL REFERENCES "clinics"("id") ON DELETE CASCADE,
  "link_token_hash" text NOT NULL,
  "status" "tablet_session_status" DEFAULT 'pending' NOT NULL,
  "doctor_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "expires_at" timestamptz NOT NULL,
  "unlocked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tablet_sessions_cabinet_idx" ON "tablet_sessions" ("cabinet_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "tablet_cabinets_clinic_idx" ON "tablet_cabinets" ("clinic_id");
