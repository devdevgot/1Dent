CREATE TABLE IF NOT EXISTS "dental_ai_analyses" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL REFERENCES "clinics"("id") ON DELETE CASCADE,
  "patient_id" text NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
  "report_text" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "dental_ai_analyses_clinic_patient_uidx"
  ON "dental_ai_analyses" ("clinic_id", "patient_id");
