---
name: TMA static serving via api-server
description: Why the tg-admin-app frontend is served as a static build from the api-server rather than its own Vite workflow.
---

# TMA Static Serving via api-server

## The Rule
Build `artifacts/tg-admin-app` with `pnpm --filter @workspace/tg-admin-app run build` and serve the dist at `/tg-admin/` from the api-server using `express.static`.

**Why:** Replit's workflow port detection (`restart_workflow` / `DIDNT_OPEN_A_PORT`) consistently fails for web artifacts whose `previewPath` is a sub-path (e.g. `/tg-admin/`). Only root-path artifacts (previewPath = `/`) are detected reliably. The api-server (already running on port 8080) serves the built static files correctly via the proxy.

**How to apply:**
- After any frontend change, rebuild: `pnpm --filter @workspace/tg-admin-app run build`
- api-server `app.ts` mounts the dist dir at `/tg-admin` (after the tmaRouter, before errorHandler)
- The path `__dirname` in the built ESM is `artifacts/api-server/dist/` — go up **3** levels (`../../..`) to reach workspace root, then `artifacts/tg-admin-app/dist/public`
- tg-admin-app artifact `paths = ["/tg-admin-dev/"]` (avoids proxy conflict); api-server artifact `paths` includes `/tg-admin`
