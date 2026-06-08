ALTER TABLE "clinics" ADD COLUMN "ai_bonus_credits" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE "ai_credit_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"user_id" text,
	"feature" text NOT NULL,
	"credits" integer NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_credit_usage" ADD CONSTRAINT "ai_credit_usage_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_credit_usage" ADD CONSTRAINT "ai_credit_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ai_credit_usage_clinic_created_idx" ON "ai_credit_usage" ("clinic_id", "created_at");
