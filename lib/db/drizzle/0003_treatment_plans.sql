DO $$ BEGIN
  CREATE TYPE "treatment_plan_status" AS ENUM ('draft', 'approved', 'in_progress', 'completed');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "treatment_plan_item_status" AS ENUM ('pending', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "treatment_plans" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL REFERENCES "clinics"("id") ON DELETE CASCADE,
  "patient_id" text NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
  "doctor_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "status" "treatment_plan_status" DEFAULT 'draft' NOT NULL,
  "notes" text,
  "total_cost" real DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "treatment_plan_items" (
  "id" text PRIMARY KEY NOT NULL,
  "plan_id" text NOT NULL REFERENCES "treatment_plans"("id") ON DELETE CASCADE,
  "clinic_id" text NOT NULL REFERENCES "clinics"("id") ON DELETE CASCADE,
  "patient_id" text NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
  "tooth_fdi" integer,
  "condition" "tooth_condition",
  "mkb10_code" text,
  "title" text NOT NULL,
  "price" real DEFAULT 0 NOT NULL,
  "status" "treatment_plan_item_status" DEFAULT 'pending' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "procedure_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
