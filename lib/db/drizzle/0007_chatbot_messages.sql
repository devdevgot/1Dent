DO $$ BEGIN
  CREATE TYPE "chatbot_message_direction" AS ENUM('inbound', 'outbound');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "chatbot_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL REFERENCES "clinics"("id") ON DELETE CASCADE,
  "phone" text NOT NULL,
  "direction" "chatbot_message_direction" NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chatbot_messages_clinic_phone_idx" ON "chatbot_messages" ("clinic_id", "phone");
