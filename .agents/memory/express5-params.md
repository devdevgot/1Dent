---
name: Express 5 req.params typing
description: How to correctly type req.params in Express 5 (@types/express ^5.0.6)
---

In Express 5 with `@types/express@^5.0.6`, bracket-indexing `req.params["key"]` returns `string | string[]`, which is incompatible with drizzle-orm's `eq()` that expects `string | SQLWrapper`.

**The rule:** Never use `req.params["key"]!` — the non-null assertion does not narrow `string[]` away.

**Fix options:**
1. `req.params["key"] as string` — inline cast (most concise)
2. `const { key } = req.params as Record<string, string>` — for multiple params

**Why:** Express 5 types the params dictionary more broadly than Express 4 to handle array params from query strings. The `!` operator only removes `null | undefined`, not `string[]`.

**How to apply:** Any time you access route params in Express 5 handlers, use one of the two patterns above. Applies to all controller files in api-server.
