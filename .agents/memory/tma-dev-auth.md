---
name: TMA Dev Auth Bypass
description: TMA_DEV_BYPASS_TG_ID must match PLATFORM_SUPERADMIN_TG_ID for dev auth to pass
---

In dev mode, the TMA middleware allows bypassing Telegram signature validation if:
- `NODE_ENV !== "production"`
- `TMA_DEV_BYPASS_TG_ID` env var is set
- Client sends `X-Telegram-Init-Data: dev`

**Why:** The bypass telegramUserId is checked against PLATFORM_SUPERADMIN_TG_ID first. If they don't match (e.g. bypass is 999999999 but superadmin is 1337923744) and no DB row exists, returns 403.

**How to apply:** Always set TMA_DEV_BYPASS_TG_ID=1337923744 (same as PLATFORM_SUPERADMIN_TG_ID) in development environment.
