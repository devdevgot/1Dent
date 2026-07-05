-- Chatbot reliability, NPS, broadcast compliance, and performance indexes

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS phone_normalized varchar(15),
  ADD COLUMN IF NOT EXISTS marketing_opt_out boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS patients_clinic_phone_norm_idx
  ON patients (clinic_id, phone_normalized);

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS green_api_webhook_secret text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Almaty';

ALTER TABLE chatbot_settings
  ADD COLUMN IF NOT EXISTS scoring_config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS patient_reviews (
  id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id text NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id text REFERENCES users(id) ON DELETE SET NULL,
  procedure_id text REFERENCES procedures(id) ON DELETE SET NULL,
  score integer NOT NULL CHECK (score >= 1 AND score <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_reviews_clinic_doctor_idx
  ON patient_reviews (clinic_id, doctor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS processed_webhook_messages (
  id text PRIMARY KEY,
  clinic_id text NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  whatsapp_message_id text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS processed_webhook_messages_clinic_msg_uidx
  ON processed_webhook_messages (clinic_id, whatsapp_message_id);

CREATE INDEX IF NOT EXISTS procedures_clinic_doctor_status_idx
  ON procedures (clinic_id, doctor_id, status);

CREATE INDEX IF NOT EXISTS procedures_clinic_doctor_scheduled_idx
  ON procedures (clinic_id, doctor_id, scheduled_at)
  WHERE status <> 'cancelled';

CREATE UNIQUE INDEX IF NOT EXISTS dental_broadcast_runs_clinic_date_uidx
  ON dental_broadcast_runs (clinic_id, run_date);

-- Best-effort backfill of normalized phones (8XXXXXXXXXX → 7XXXXXXXXXX handled in app layer)
UPDATE patients
SET phone_normalized = regexp_replace(phone, '[^0-9]', '', 'g')
WHERE phone_normalized IS NULL AND phone IS NOT NULL AND phone <> '';

UPDATE patients
SET phone_normalized = '7' || substring(phone_normalized from 2)
WHERE phone_normalized IS NOT NULL
  AND length(phone_normalized) = 11
  AND phone_normalized LIKE '8%';
