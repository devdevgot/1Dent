ALTER TABLE "chatbot_settings"
  ADD COLUMN IF NOT EXISTS "agent_mode_enabled" boolean NOT NULL DEFAULT true;
