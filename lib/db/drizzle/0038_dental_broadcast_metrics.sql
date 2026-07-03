ALTER TABLE "chatbot_settings" ADD COLUMN IF NOT EXISTS "broadcast_ai_enabled" boolean DEFAULT false NOT NULL;

ALTER TABLE "dental_broadcast_runs" ADD COLUMN IF NOT EXISTS "replies_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "dental_broadcast_runs" ADD COLUMN IF NOT EXISTS "bookings_count" integer DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS "dental_broadcast_deliveries" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL REFERENCES "clinics"("id") ON DELETE CASCADE,
  "run_id" text NOT NULL REFERENCES "dental_broadcast_runs"("id") ON DELETE CASCADE,
  "patient_id" text NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
  "message_id" text,
  "content" text NOT NULL,
  "used_ai" boolean DEFAULT false NOT NULL,
  "sent_at" timestamptz DEFAULT now() NOT NULL,
  "replied_at" timestamptz,
  "booked_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "dental_broadcast_deliveries_patient_idx"
  ON "dental_broadcast_deliveries" ("clinic_id", "patient_id", "sent_at" DESC);

CREATE INDEX IF NOT EXISTS "dental_broadcast_deliveries_run_idx"
  ON "dental_broadcast_deliveries" ("run_id");
