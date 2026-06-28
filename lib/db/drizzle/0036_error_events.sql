CREATE TABLE IF NOT EXISTS "error_events" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"severity" text DEFAULT 'error' NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"code" text,
	"clinic_id" text,
	"user_id" text,
	"request_id" text,
	"url" text,
	"method" text,
	"user_agent" text,
	"metadata" jsonb,
	"fingerprint" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "error_events" ADD CONSTRAINT "error_events_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "error_events" ADD CONSTRAINT "error_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_events_created_at_idx" ON "error_events" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_events_fingerprint_idx" ON "error_events" ("fingerprint");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_events_clinic_id_idx" ON "error_events" ("clinic_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_events_resolved_at_idx" ON "error_events" ("resolved_at");
