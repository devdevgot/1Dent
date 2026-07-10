CREATE TABLE IF NOT EXISTS "landing_leads" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "phone" text NOT NULL,
  "clinic_name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'new',
  "source" text NOT NULL DEFAULT 'landing',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "landing_leads_status_created_at_idx"
  ON "landing_leads" ("status", "created_at" DESC);
