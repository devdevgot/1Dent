CREATE TABLE IF NOT EXISTS "platform_admins" (
	"id" text PRIMARY KEY NOT NULL,
	"telegram_user_id" text NOT NULL,
	"name" text NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_telegram_user_id_unique" UNIQUE("telegram_user_id")
);
