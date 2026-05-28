---
name: Dental AI dedup
description: How the dental AI analysis avoids redundant OpenRouter API calls.
---

The fix: `analysisDeupCache` (Map in `dental-ai.ts`) stores `{ hash, triggeredAt }` per `clinicId:patientId`.
Before calling OpenRouter, `computeTeethHash()` computes FNV-1a hash of sorted teeth conditions/notes.
If same hash was triggered within last 30 minutes → skip silently.
On error → evict cache so a retry is allowed.

**Why:** Without dedup, every tooth PUT fired a new OpenRouter call even if conditions were identical.

**How to apply:**
- `triggerDentalAiAnalysis(clinicId, patientId, force?)` — pass `force=true` only for explicit user-triggered re-analysis.
- `deleteLatestDentalAnalysis` also evicts the in-memory cache.
- The GET `/ai-analysis` endpoint no longer auto-triggers AI; it only returns the cached DB row.
- Frontend: `staleTime: Infinity` (no polling), manual "Обновить" button calls POST `/trigger-ai-analysis` which deletes+re-triggers.
