ALTER TABLE "treatment_plan_items" ADD COLUMN IF NOT EXISTS "notes" text;
--> statement-breakpoint
ALTER TABLE "treatment_plan_items" ADD COLUMN IF NOT EXISTS "stage" text;
--> statement-breakpoint
ALTER TABLE "treatment_plan_items" ADD COLUMN IF NOT EXISTS "discount" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "treatment_plan_items" ADD COLUMN IF NOT EXISTS "attachments" json DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE "treatment_plan_items" ADD COLUMN IF NOT EXISTS "assigned_doctor_id" text;
--> statement-breakpoint
ALTER TABLE "treatment_plan_items" ADD COLUMN IF NOT EXISTS "bundle_token" text;
--> statement-breakpoint
ALTER TABLE "treatment_plan_items" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp with time zone;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "treatment_plan_items"
    ADD CONSTRAINT "treatment_plan_items_assigned_doctor_id_users_id_fk"
    FOREIGN KEY ("assigned_doctor_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;
