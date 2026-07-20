# Workspace

## Overview

Dental CRM — SaaS platform for dental clinics with multi-tenant architecture. Anti-theft system protecting patient data from staff copying.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: JWT (httpOnly cookies), bcryptjs
- **Cache/Redis**: ioredis (optional, no REDIS_URL = disabled)
- **Frontend**: React + Vite + TypeScript, Zustand, TanStack Query, Tailwind CSS, react-hook-form

## Multi-tenancy

Every clinic is a separate tenant, isolated by `clinicId` in JWT payload and all repository queries.

## Architecture

Backend follows modular monolith pattern: `modules/<feature>/controller → service → repository`.
Standard API response format: `{ success, data?, error?, code?, message? }`.

## Roles

- `owner` — full access
- `admin` — operational management
- `doctor` — own patients only, masked phone numbers
- `accountant` — read-only financials
- `warehouse` — inventory management (read + update stock)

## Phone masking

Doctors never see full phone numbers — server returns `+7 *** *** **XX` format.

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Implemented Features

### Task #1 — Auth Foundation
- JWT httpOnly cookie auth (register/login/logout/me)
- Multi-tenant clinic isolation via clinicId in JWT
- Role-based access: owner/admin/doctor/accountant/warehouse
- Frontend: login/register pages, protected routes, role-based sidebar, role-specific dashboard redirects

### Task #2 — Kanban Board & Patient Card
- DB schema: `patients` + `patient_interactions` tables (Drizzle, migrated)
- Patients module: controller → service → repository
- Phone masking: doctors see `+* *** *** **XX` format
- Doctor isolation: doctors only see their own patients (repository-level)
- Kanban UI: 7-column board with drag-and-drop (dnd-kit)
- Columns: Новая заявка → Консультация → Диагностика → Назначено → Лечение → Постоп контроль → Завершено
- Patient card: name, masked phone, source badge, date, age
- Patient detail side panel: full data, interaction history, status change, add interaction
- Create patient dialog: name/phone/age/source/doctor/notes
- Optimistic kanban drag updates with server reconciliation
- OpenAPI spec extended with patient endpoints; codegen re-run

### Task #3 — WhatsApp Integration & Red Alert
- WhatsApp Business Cloud API proxy (masks real phone numbers from frontend)
- Webhook endpoint for inbound messages with Hub verification
- Red Alert pipeline: BullMQ-gated (returns null if no REDIS_URL) — auto-detects missed patient follow-ups
- Chat UI: mobile single-panel navigation with back button, h-[calc(100dvh-7.5rem)] scroll area
- AppLayout: bottom navigation with Sheet "More" drawer for overflow items, safe-area CSS, viewport-fit=cover
- Role isolation: doctors redirected to /dashboard/doctor, accountants to /dashboard/accountant, etc.

### Task #20 — Admin Desktop Redesign (Sidebar Layout, Calendar, Finance)
- AdminLayout: fixed dark sidebar (`#1a2204`) with collapsible icon-only mode at `lg`, hamburger on mobile, logo, notification bell, user badge, logout
- Admin role auto-detection in `ProtectedRoute` — if `user.role === "admin"`, renders `AdminLayout` instead of `AppLayout`
- New admin pages:
  - `/admin/calendar` — week/day view calendar, click-to-create, edit/delete appointment modals (uses procedures API)
  - `/admin/appointments/new` — full appointment form with patient search, doctor selection, date/time picker
  - `/admin/finance` — KPI cards, monthly revenue bar chart, payment method pie chart, top procedures table (Recharts)
- Admin dashboard updated: new quick actions link to calendar/finance/new appointment
- Chat page height adapted for admin layout (`lg:h-full`)
- Kanban height adapted for admin layout (`lg:h-full`)
- i18n: `adminNav`, `adminCalendar`, `adminFinance`, `adminAppointment`, `roles` keys added to ru/en/kz

### Task #5 — Dashboards, Doctor KPI & Procedure Management
- DB: `procedures` + `procedure_templates` tables (Drizzle, pushed)
- API: full CRUD for procedures (`GET/POST /procedures`, `PUT/PATCH/DELETE /procedures/:id`, `PATCH /procedures/:id/status`)
- Templates API: `GET/POST /procedures/templates`, `DELETE /procedures/templates/:id`
- Analytics: `GET /analytics` (role-adaptive: owner/accountant get revenue metrics, doctor gets own stats, admin/warehouse get clinic overview)
- Doctor KPI: `GET /kpi/doctors` (owner/admin only) — patientsCount, proceduresCount, revenueTotal per doctor
- OpenAPI: procedures, analytics, kpi/doctors endpoints + schemas added; codegen re-run
- Dashboard: rewritten with real analytics data, doctor KPI table for owners, role-adaptive KPI cards, quick action shortcuts
- Procedures page: table with status filter pills, search, status transition menu (scheduled→in_progress→completed/cancelled), create dialog with template picker and patient/doctor selectors, role-gated write access
- i18n: procedure and dashboard translations added to ru/en/kz

### Task #4 — FDI Dental Chart & Inventory
- DB: `tooth_records` + `inventory_items` + `inventory_stock` + `tooth_treatments` tables (Drizzle, pushed)
- API: `PUT /patients/:id/teeth/:toothFdi` (upsert), `GET /patients/:id/teeth`, treatment endpoints
- Inventory CRUD: `GET/POST /inventory`, `PATCH /inventory/:id/stock`, `DELETE /inventory/:id`
- FDI chart: 32-tooth SVG with FDI numbering, color-coded conditions, legend; `buildRowPositions()` layout engine
- Tooth conditions: healthy, cavity, treated, crown, root_canal, implant, missing, extraction_needed
- Tooth detail panel: condition editor, treatment history list, inventory item selector
- Patient detail panel: История / Зубная карта tabs
- Inventory page: mobile-first card list, category filters, inline stock editor, low-stock alerts, role-gated create/edit/delete
- OpenAPI spec updated, codegen run, TypeScript passes cleanly

### Foolproofing — unified confirmations for dangerous actions
- Purpose: "защита от дурака" — prevent accidental destructive/irreversible actions across web + PWA (including `/tablet`).
- Infrastructure (`artifacts/dental-crm`):
  - `hooks/use-confirm.tsx` — `ConfirmProvider` + imperative `useConfirm()` hook returning `confirm(options): Promise<boolean>`. Provider is mounted in `App.tsx` (wraps the whole router).
  - `components/ui/confirm-dialog.tsx` — single `ConfirmDialog` built on `AlertDialog`, driven by the provider.
  - i18n keys under `confirm.*` in `locales/{ru,en,kz}.json` (generic labels/hints). Per-action titles/descriptions are passed inline (mostly Russian, matching existing UI).
- Severity tones:
  - `warning` — single confirmation, neutral primary button (e.g. payment-method classification, staff invitation).
  - `danger` — single confirmation, red button; default for deletions/irreversible actions (payroll approval, salary scheme change, tooth extraction start, plan-item cancel, attachment delete, mass import, chatbot disable, knowledge-source delete / prompt regenerate, integration disconnects, WhatsApp reconnect, app-lock disable, tablet unlink, expense/contract-template delete).
  - `critical` — **double confirmation via type-to-confirm**: the user must type an exact phrase (`requirePhrase`, usually the entity name or "УДАЛИТЬ") before the confirm button enables. Reserved for the most destructive actions only: delete staff user, delete clinic branch, delete geo-tracking branch, wipe all clinic data.
- Usage:
  ```ts
  const confirm = useConfirm();
  if (!(await confirm({ tone: "danger", title: "Удалить?" }))) return;
  mutation.mutate(...);
  ```
- Intentionally left WITHOUT confirmation (per product decision, to avoid friction): logout, patient status change (drag & dropdown), inventory stock inline edit, expense create/edit forms, routine treatment/plan-item completion.
- All native `window.confirm` calls were replaced with the unified dialog.

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

**Global 401 interceptor**: `custom-fetch.ts` exports `setUnauthorizedHandler(fn)`. When any API request returns 401 (except `/api/auth/me`, `/api/auth/login`, `/api/auth/register`), the handler fires **once** (deduplicated). In `App.tsx`, `AuthProvider` registers a handler that calls `queryClient.clear()` + `clearAuth()` + redirects to `/login`. This ensures that when a JWT token expires mid-session, the user is automatically logged out instead of seeing silent errors.

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

## Pending Features / Backlog

### Registration use-case selection → Admin panel
During clinic registration (Step 2 of the multi-step register flow), the user selects one or more intended use-cases for the platform (CRM, Расписание, WhatsApp, Финансы, Аналитика, Маркетинг).
**TODO**: These selections must be:
1. Saved to the database on the clinic record (e.g. a `useCases: text[]` or `jsonb` column on the `clinics` table)
2. Sent from the frontend as part of the register API payload
3. Visible and editable in the owner/admin panel (e.g. in clinic settings or a dedicated admin analytics section)
