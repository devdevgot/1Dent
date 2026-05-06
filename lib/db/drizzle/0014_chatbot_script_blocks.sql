ALTER TABLE "chatbot_settings" ADD COLUMN IF NOT EXISTS "script_blocks" jsonb DEFAULT '[]'::jsonb;
