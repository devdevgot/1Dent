CREATE TABLE IF NOT EXISTS "customer_care_settings" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "lead_nurture_enabled" boolean DEFAULT true NOT NULL,
  "lead_nurture_delays_minutes" jsonb DEFAULT '[25,150,1440]'::jsonb NOT NULL,
  "reminder_1h_enabled" boolean DEFAULT true NOT NULL,
  "reminder_24h_enabled" boolean DEFAULT true NOT NULL,
  "no_show_enabled" boolean DEFAULT true NOT NULL,
  "no_show_grace_hours" integer DEFAULT 2 NOT NULL,
  "post_visit_enabled" boolean DEFAULT true NOT NULL,
  "upsell_enabled" boolean DEFAULT true NOT NULL,
  "booking_mode" text DEFAULT 'handoff_to_booking' NOT NULL,
  "prompts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_care_settings" ADD CONSTRAINT "customer_care_settings_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_care_settings_clinic_id_unique" ON "customer_care_settings" ("clinic_id");
