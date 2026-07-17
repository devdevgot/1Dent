CREATE TABLE IF NOT EXISTS "platform_push_broadcasts" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "url" text,
  "clinic_id" text REFERENCES "clinics"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'sent',
  "recipient_count" integer NOT NULL DEFAULT 0,
  "sent_count" integer NOT NULL DEFAULT 0,
  "failed_count" integer NOT NULL DEFAULT 0,
  "created_by_tg_id" text,
  "created_by_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "platform_push_broadcasts_created_at_idx"
  ON "platform_push_broadcasts" ("created_at" DESC);
