-- Add OTP columns for WhatsApp-based contract signing verification
ALTER TABLE "patient_contracts" ADD COLUMN IF NOT EXISTS "otp_code" text;
ALTER TABLE "patient_contracts" ADD COLUMN IF NOT EXISTS "otp_expires_at" timestamp with time zone;
