-- Finance / payroll tables and enums (were in Drizzle schema but never had SQL migrations).
-- Idempotent: safe on DBs that already have these objects from drizzle push.

DO $$ BEGIN
  CREATE TYPE "public"."expense_category" AS ENUM(
    'salary', 'materials', 'rent', 'utilities', 'equipment', 'marketing', 'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."payroll_status" AS ENUM('pending', 'approved', 'paid');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."salary_type" AS ENUM(
    'fixed', 'commission', 'fixed_plus_commission', 'hourly'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TYPE "public"."procedure_status" ADD VALUE IF NOT EXISTS 'pending_payment';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_salary_settings" (
  "user_id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL,
  "salary_type" "salary_type" DEFAULT 'fixed' NOT NULL,
  "fixed_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
  "commission_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_records" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL,
  "user_id" text NOT NULL,
  "period_month" integer NOT NULL,
  "period_year" integer NOT NULL,
  "salary_type" "salary_type" NOT NULL,
  "fixed_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
  "commission_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
  "revenue_base" numeric(12, 2) DEFAULT '0' NOT NULL,
  "calculated_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
  "approved_amount" numeric(12, 2),
  "status" "payroll_status" DEFAULT 'pending' NOT NULL,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clinic_expenses" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL,
  "category" "expense_category" DEFAULT 'other' NOT NULL,
  "subcategory" text,
  "amount" numeric(12, 2) DEFAULT '0' NOT NULL,
  "description" text,
  "expense_date" timestamp with time zone DEFAULT now() NOT NULL,
  "period_month" integer,
  "period_year" integer,
  "payroll_ref" text,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_salary_settings"
    ADD CONSTRAINT "user_salary_settings_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_salary_settings"
    ADD CONSTRAINT "user_salary_settings_clinic_id_clinics_id_fk"
    FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_records"
    ADD CONSTRAINT "payroll_records_clinic_id_clinics_id_fk"
    FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_records"
    ADD CONSTRAINT "payroll_records_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_records"
    ADD CONSTRAINT "payroll_records_approved_by_users_id_fk"
    FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "clinic_expenses"
    ADD CONSTRAINT "clinic_expenses_clinic_id_clinics_id_fk"
    FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "clinic_expenses"
    ADD CONSTRAINT "clinic_expenses_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_records_unique_period"
  ON "payroll_records" ("clinic_id", "user_id", "period_year", "period_month");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clinic_expenses_payroll_unique"
  ON "clinic_expenses" ("clinic_id", "payroll_ref", "category")
  WHERE "payroll_ref" IS NOT NULL;
