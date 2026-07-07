-- Sync procedure_templates columns that exist in Drizzle schema but were never added via SQL migrations.
-- Without these, seed/list on /api/procedures/templates fails (PostgreSQL 42703) and прейскурант stays empty.

ALTER TABLE "procedure_templates" ADD COLUMN IF NOT EXISTS "category" text DEFAULT 'other' NOT NULL;
--> statement-breakpoint
ALTER TABLE "procedure_templates" ADD COLUMN IF NOT EXISTS "code" text;
