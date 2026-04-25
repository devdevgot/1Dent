CREATE TABLE IF NOT EXISTS "doctor_handoffs" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL REFERENCES "clinics"("id") ON DELETE CASCADE,
  "from_doctor_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "to_doctor_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "procedure_id" text REFERENCES "procedures"("id") ON DELETE SET NULL,
  "reason" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doctor_handoffs_clinic_idx" ON "doctor_handoffs" ("clinic_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doctor_handoffs_from_doctor_idx" ON "doctor_handoffs" ("from_doctor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doctor_handoffs_to_doctor_idx" ON "doctor_handoffs" ("to_doctor_id");
