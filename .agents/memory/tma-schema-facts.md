---
name: TMA controller schema column facts
description: Actual column names in tables used by tma.controller.ts that differ from intuitive names
---

**procedureTemplatesTable** (lib/db/src/schema/procedures.ts):
- `defaultPrice: real` — NOT `price`. Type is `real` (number), not string.
- No `duration` column.
- Has: id, clinicId, name, description, defaultPrice, materials, category, code, createdAt

**knowledgeSourcesTable** (lib/db/src/schema/knowledge.ts):
- No `content` column. Use `extractedText` for text content.
- Has: id, clinicId, type, name, url, storageKey, extractedText, status, errorMessage, createdAt

**appointmentRemindersTable / postopFollowupsTable**: No dedicated `broadcastsTable` — these two tables serve as broadcast targets.

**Why:** These mismatches caused TS2769 "No overload matches" on `.values({...})` drizzle inserts because unknown fields were being passed.

**How to apply:** When adding insert/update operations for these tables, always check the actual schema file first.
