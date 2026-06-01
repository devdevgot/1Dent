DO $$ BEGIN
  CREATE TYPE "admin_broadcast_status" AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "admin_broadcasts" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text REFERENCES "clinics"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "status" "admin_broadcast_status" DEFAULT 'draft' NOT NULL,
  "scheduled_at" timestamp with time zone,
  "sent_count" integer DEFAULT 0 NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
