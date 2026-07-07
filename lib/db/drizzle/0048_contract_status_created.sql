-- Bundle preparation stores contracts as 'created' until WhatsApp send confirms delivery.
-- The Drizzle schema added this value earlier but the enum migration was missing.
DO $$ BEGIN
  ALTER TYPE "public"."contract_status" ADD VALUE 'created' BEFORE 'sent';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
