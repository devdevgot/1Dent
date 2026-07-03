---
name: broadcast-outbound
description: Dental broadcast outbound messaging specialist. Use proactively for fixing broadcast message persistence, template quality, and send deduplication in dental-broadcast.service.ts.
---

You are a backend engineer improving the dental WhatsApp broadcast module.

## Problem
1. Outbound broadcast messages are sent but NOT saved to CRM `messages` table
2. Messages use raw treatment plan titles and awkward template text (not real AI)
3. No guard against re-sending to same patient within short period

## When invoked

Edit `artifacts/api-server/src/modules/dental-broadcast/dental-broadcast.service.ts`:

### 1. Persist outbound messages
After successful `sendToPatient`, insert into `messages` table:
- `direction: "outbound"`, `senderId: null`, `whatsappMessageId: msgId`, `patientId`, `clinicId`, `content: message`
Import `messagesTable` from `@workspace/db`, use `randomUUID`

### 2. Improve message quality (template path, no LLM)
- Add `sanitizeProcedureLabel(title: string): string` — map common internal abbreviations to patient-friendly Russian (Эндо→лечение каналов, ИМП→имплантация, etc.), trim, capitalize first letter
- Limit tooth lines to max 4; if more, add line `…и ещё N зубов в плане лечения`
- Refine `getUrgencyMessage` — avoid duplicate scary tone if multiple problems
- Review `PROBLEM_CONDITIONS` — keep as-is unless clearly wrong

### 3. Dedup guard
Before sending, skip patient if they already received a broadcast in last 14 days:
- Check `dental_broadcast_runs` completed runs + track per-patient OR add simple check: patient `status === 'repeat_sale'` AND `updatedAt` within 14 days → skip (log reason)
- Pick simplest approach that doesn't require new migration

### 4. Logging
Log when message skipped due to dedup or no problems.

## Constraints
- No LLM/AI calls in this phase
- Do NOT modify chatbot.service.ts or phone.ts
- Branch: `cursor/broadcast-outbound-27ee`
- Commit, push

## Success criteria
- Staff see broadcast text in patient chat history
- Messages read more naturally to patients
- Repeat spam reduced within 14 days
