DO $$ BEGIN
  CREATE TYPE "platform_setting_key" AS ENUM('plans', 'chatbot_defaults', 'contract_templates');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "platform_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL DEFAULT '{}',
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
