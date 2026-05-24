ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "telegram_bot_token" text;
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "telegram_owner_chat_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clinic_branches" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL,
  "name" text NOT NULL,
  "latitude" real NOT NULL,
  "longitude" real NOT NULL,
  "radius_meters" real DEFAULT 200 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "clinic_branches_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE
);
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "geo_event_type" AS ENUM ('checkin', 'checkout');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geo_events" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL,
  "user_id" text NOT NULL,
  "branch_id" text NOT NULL,
  "event_type" "geo_event_type" NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "geo_events_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE,
  CONSTRAINT "geo_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "geo_events_branch_id_clinic_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "clinic_branches"("id") ON DELETE CASCADE
);
