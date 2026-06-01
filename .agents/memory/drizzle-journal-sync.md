---
name: Drizzle journal sync
description: When SQL migrations are applied directly via psql, the journal file must be updated manually.
---

When you apply a migration via `psql "$DATABASE_URL" -c "ALTER TABLE ..."` directly instead of running `pnpm run migrate`, the Drizzle migration journal at `lib/db/drizzle/meta/_journal.json` does NOT get updated automatically.

**Why:** Drizzle's migrate runner tracks which migration files have been applied by matching entries in the journal (which maps to the `__drizzle_migrations` table in the DB). If a file exists in `lib/db/drizzle/` but has no journal entry, `pnpm run migrate` will try to apply it again and fail if the column/table already exists.

**How to apply:**
1. Apply the SQL: `psql "$DATABASE_URL" -c "ALTER TABLE ... ADD COLUMN IF NOT EXISTS ..."`
2. Add the entry to `lib/db/drizzle/meta/_journal.json`:
```json
{
  "idx": <next_index>,
  "version": "7",
  "when": <unix_ms_timestamp>,
  "tag": "<migration_filename_without_sql>",
  "breakpoints": true
}
```
3. Verify: `psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='...'"`
