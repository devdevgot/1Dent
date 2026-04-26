DO $$ BEGIN
  CREATE TYPE "broadcast_status" AS ENUM ('pending', 'running', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "dental_broadcast_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL REFERENCES "clinics"("id") ON DELETE CASCADE,
  "run_date" date NOT NULL,
  "status" "broadcast_status" NOT NULL DEFAULT 'pending',
  "total_patients" integer NOT NULL DEFAULT 0,
  "processed_patients" integer NOT NULL DEFAULT 0,
  "messages_sent" integer NOT NULL DEFAULT 0,
  "errors_count" integer NOT NULL DEFAULT 0,
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "dental_broadcast_runs_clinic_date_uidx"
  ON "dental_broadcast_runs" ("clinic_id", "run_date");
