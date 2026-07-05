DO $$ BEGIN
  ALTER TYPE "tablet_session_status" ADD VALUE IF NOT EXISTS 'awaiting_pairing';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "tablet_sessions" ALTER COLUMN "cabinet_id" DROP NOT NULL;
ALTER TABLE "tablet_sessions" ALTER COLUMN "clinic_id" DROP NOT NULL;
