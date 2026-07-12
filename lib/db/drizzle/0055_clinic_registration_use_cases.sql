ALTER TABLE "clinics"
  ADD COLUMN IF NOT EXISTS "registration_use_cases" jsonb NOT NULL DEFAULT '[]'::jsonb;
