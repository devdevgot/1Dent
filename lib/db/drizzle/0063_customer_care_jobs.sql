CREATE TABLE IF NOT EXISTS "customer_care_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL REFERENCES "clinics"("id") ON DELETE CASCADE,
  "patient_id" text REFERENCES "patients"("id") ON DELETE SET NULL,
  "phone" text NOT NULL,
  "type" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "step" integer DEFAULT 0 NOT NULL,
  "send_at" timestamptz NOT NULL,
  "procedure_id" text REFERENCES "procedures"("id") ON DELETE SET NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sent_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "customer_care_jobs_due_idx"
  ON "customer_care_jobs" ("status", "send_at");

CREATE INDEX IF NOT EXISTS "customer_care_jobs_clinic_phone_idx"
  ON "customer_care_jobs" ("clinic_id", "phone");

CREATE INDEX IF NOT EXISTS "customer_care_jobs_procedure_idx"
  ON "customer_care_jobs" ("procedure_id");

-- Idempotent enqueue: one pending/sent job per clinic+phone+type+step+procedure
CREATE UNIQUE INDEX IF NOT EXISTS "customer_care_jobs_dedupe_idx"
  ON "customer_care_jobs" (
    "clinic_id",
    "phone",
    "type",
    "step",
    COALESCE("procedure_id", '')
  );
