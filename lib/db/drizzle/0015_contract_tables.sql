DO $$ BEGIN
  CREATE TYPE "public"."contract_status" AS ENUM('sent', 'viewed', 'signed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contract_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_type" text DEFAULT 'docx' NOT NULL,
	"extracted_text" text,
	"field_mappings" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_templates_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"template_id" text NOT NULL,
	"sent_by_id" text,
	"token" text NOT NULL,
	"rendered_html" text,
	"filled_data" jsonb DEFAULT '{}' NOT NULL,
	"status" "contract_status" DEFAULT 'sent' NOT NULL,
	"signed_at" timestamp with time zone,
	"signed_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_contracts_token_unique" UNIQUE("token"),
	CONSTRAINT "patient_contracts_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE,
	CONSTRAINT "patient_contracts_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE,
	CONSTRAINT "patient_contracts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "contract_templates"("id") ON DELETE RESTRICT,
	CONSTRAINT "patient_contracts_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE SET NULL
);
