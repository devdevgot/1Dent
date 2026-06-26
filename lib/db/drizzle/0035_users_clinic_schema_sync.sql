-- Sync users/clinics columns that exist in Drizzle schema but were never added via SQL migrations.
-- Without these, INSERT ... RETURNING on /api/auth/register fails (PostgreSQL 42703).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "position" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "specialty" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hire_date" date;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "green_api_url" text;
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "telegram_connect_token" text;
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "telegram_platform_chat_id" text;
