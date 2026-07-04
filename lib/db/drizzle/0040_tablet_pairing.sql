CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE "tablet_cabinets" ADD COLUMN IF NOT EXISTS "pairing_code" text;

UPDATE "tablet_cabinets"
SET "pairing_code" = lpad((abs(hashtext("id" || "clinic_id")) % 900000 + 100000)::text, 6, '0')
WHERE "pairing_code" IS NULL;

INSERT INTO "tablet_cabinets" ("id", "clinic_id", "name", "pin_hash", "pairing_code")
SELECT
  gen_random_uuid()::text,
  c."id",
  c."name" || ' · Кабинет 1',
  '$2b$10$h1xY16R6dO.XXX51lp4GUep0rTSe61O8Ik9niWcAxlzPnh9zv6KUK',
  lpad((abs(hashtext(c."id")) % 900000 + 100000)::text, 6, '0')
FROM "clinics" c
WHERE NOT EXISTS (
  SELECT 1 FROM "tablet_cabinets" tc WHERE tc."clinic_id" = c."id"
);

CREATE UNIQUE INDEX IF NOT EXISTS "tablet_cabinets_pairing_code_idx" ON "tablet_cabinets" ("pairing_code");
