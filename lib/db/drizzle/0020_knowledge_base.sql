CREATE TABLE IF NOT EXISTS "knowledge_sources" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL,
  "type" text NOT NULL,
  "name" text NOT NULL,
  "url" text,
  "storage_key" text,
  "extracted_text" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "knowledge_sources_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_scripts" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text UNIQUE NOT NULL,
  "primary_script" jsonb,
  "repeat_script" jsonb,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "knowledge_scripts_clinic_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE
);
