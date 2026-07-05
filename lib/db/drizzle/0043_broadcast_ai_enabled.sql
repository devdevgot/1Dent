ALTER TABLE chatbot_settings
  ADD COLUMN IF NOT EXISTS broadcast_ai_enabled boolean NOT NULL DEFAULT false;
