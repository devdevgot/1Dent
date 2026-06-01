---
name: TMA dev bypass setup
description: How to enable the development auth bypass for the TMA superadmin panel.
---

# TMA Dev Auth Bypass

## The Rule
For the dev preview at `/tg-admin/` to work without a real Telegram session, two env vars must be set in the **development** environment:

- `TMA_DEV_BYPASS_TG_ID` — a placeholder Telegram user ID (e.g. `"999999999"`)
- `PLATFORM_SUPERADMIN_TG_ID` — same ID, so the superadmin check in `checkIsAdmin()` passes

**Why:** `tma.middleware.ts` checks `if (devBypass && initData === "dev")` — only active when both the env var is present AND the frontend sends `"dev"` as initData. The frontend (`App.tsx`) already falls back to `"dev"` when `WebApp.initData` is empty (browser preview, not real Telegram). Without `TMA_DEV_BYPASS_TG_ID`, the server falls through to HMAC validation and returns 401.

**How to apply:**
- Set both vars via `setEnvVars({ values: {...}, environment: "development" })` 
- They are development-scope only — not needed in production (real Telegram provides valid initData)
- After setting, restart the api-server workflow to pick up the new env vars
