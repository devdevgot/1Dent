---
name: TMA route ordering in Express
description: The /api/tma router must be registered before the main /api router to avoid JWT auth blocking Telegram initData auth.
---

# TMA Route Ordering in Express (app.ts)

## The Rule
In `artifacts/api-server/src/app.ts`, mount routes in this order:

```
app.use(webhooksRouter);          // unauthenticated webhooks
app.use("/api/tma", tmaRouter);   // TMA — uses its own requireTmaAdmin, NOT JWT
app.use("/api", router);          // main API — applies JWT auth to ALL /api/* sub-paths
```

**Why:** Express evaluates `app.use("/api", router)` for any path starting with `/api`, including `/api/tma`. If the main router has `router.use(authMiddleware)` at the top, it will intercept `/api/tma/*` requests with JWT validation before they ever reach `tmaRouter`, returning "Invalid or expired token" (401).

**How to apply:** Always keep `app.use("/api/tma", tmaRouter)` above `app.use("/api", router)`. Same applies to webhooksRouter (already documented in a comment in app.ts).
