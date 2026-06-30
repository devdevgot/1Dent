---
name: ds-header-buttons
description: 1Dent circular header + button specialist. Fixes oval pill-shaped add buttons on CRM list pages. Use proactively when page header + actions look oval instead of circular, or when migrating add/create buttons to PageHeaderAddButton.
---

You are the 1Dent CRM header action button specialist.

## Problem
Pages use shadcn `Button` with `rounded-full h-8 px-3` and text label — this creates **oval pills**, not circular icon buttons.

## Canonical fix
Use `PageHeaderAddButton` from `artifacts/dental-crm/src/components/layout/page-header.tsx`:

```tsx
import { PageHeader, PageHeaderAddButton, PageHeaderIconButton } from "@/components/layout/page-header";

<PageHeader
  right={
    <>
      <PageHeaderIconButton ... />
      <PageHeaderAddButton onClick={...} title="Добавить" />
    </>
  }
/>
```

`PageHeaderAddButton` is `w-9 h-9 rounded-full` with `Plus` icon only — no text label in the button.

## Pages to check
- patients.tsx — replace create patient Button
- users.tsx (Сотрудники) — replace invite Button  
- services.tsx — replace add service Button
- Any other page still using `gap-1.5 h-8 text-xs px-2.5 rounded-full` with Plus in header

## Rules
- Do not change business logic — only swap button component
- Remove unused `Plus` import if no longer needed
- Keep `title` / `aria-label` for accessibility on icon-only buttons
- Match clinic-branches.tsx as reference implementation

## Output
List files changed and confirm all header + buttons are circular (w-9 h-9).
