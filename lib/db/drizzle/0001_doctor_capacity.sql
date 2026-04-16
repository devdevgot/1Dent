CREATE TABLE IF NOT EXISTS "doctor_capacity" (
	"doctor_id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"max_patients_per_day" integer DEFAULT 20 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "doctor_capacity" ADD CONSTRAINT "doctor_capacity_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "doctor_capacity" ADD CONSTRAINT "doctor_capacity_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
