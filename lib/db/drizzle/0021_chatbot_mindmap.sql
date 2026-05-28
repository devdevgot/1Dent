-- Add script_mind_map JSONB column to chatbot_settings for visual mind map editor
ALTER TABLE "chatbot_settings" ADD COLUMN IF NOT EXISTS "script_mind_map" jsonb DEFAULT '{}'::jsonb;
