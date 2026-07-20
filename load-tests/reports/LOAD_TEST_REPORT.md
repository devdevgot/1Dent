# Отчёт нагрузочного тестирования 1Dent (k6)

> Сгенерировано: 2026-07-20T05:43:25.563Z  
> Цель: локальный API `http://127.0.0.1:8080` (не production)  
> Стек: Express 5 + PostgreSQL 16 + Redis 7 · Node 22 · k6 v2.0.0 · 4 CPU / 16 GB RAM

---

## 1. Executive Summary

Прогнано **9 сценариев** k6 по всей поверхности CRM API (health, auth, dashboard, patients, calendar, analytics, contracts/tablet, writes).

| Вердикт | Что означает |
|---|---|
| **Рабочая ёмкость** | Локальный single-instance уверенно держит **~50 concurrent CRM-пользователей** (~125 RPS browse) с error rate **0%** и p95 **~6 ms** |
| **Spike** | Резкий скачок до **100 VU / ~244 RPS** — без ошибок; p95 latency **339 ms**, CRM-батчи 1–1.7 s |
| **Stress breakpoint (UX)** | До **250 VU / ~269 RPS** HTTP-ошибок нет, но UX деградирует: patients-batch p95 **~7.2 s**, write-flow p95 **~6.0 s** |
| **Жёсткая поломка HTTP** | Не достигнута в пределах 250 VU на этом железе и малом seed (40 patients) |
| **Auth «ломка»** | Не capacity, а **Redis rate-limit**: `10 req / 60s / IP` → при 20 RPS ~99% ответов **429** |
| **Public SPA** | ~10% `http_req_failed` из‑за **404 на `/`** (frontend dist не собран); healthz сам по себе выдерживает высокие RPS |

### Что выдерживает

| Профиль | VU / RPS | Error | p95 latency | Статус |
|---|---|---|---|---|
| Smoke | 1 VU | 0% | 4 ms | OK |
| CRM Browse | 50 VU / 125 RPS | 0% | 6 ms | OK |
| Write Ops | 30 VU / 62 RPS | 0% | 7 ms | OK |
| Soak 5m | 25 VU / 64 RPS | 0% | 20 ms | OK |
| Mixed | ~58 VU / 127 RPS | 2.2%* | 50 ms | OK |
| Spike | 100 VU / 244 RPS | 0% | 339 ms | OK (замедление) |
| Stress | 250 VU / 269 RPS | 0% | 941 ms | UX degraded |

\* ошибки mixed почти целиком от auth 429 в параллельном auth-потоке.

### Где ломается (по приоритету)

1. **Auth rate-limit (by design)** — при >10 login/min с одного IP ответы 429. Защита работает.
2. **Patients/kanban batch под stress** — самый тяжёлый поток (p95 **7.2 s** при 250 VU).
3. **Write path** (create patient + interaction + procedure) — p95 **6.0 s** на stress.
4. **Dashboard fan-out** (6 параллельных API) — p95 **3.6 s** на stress; при 50 VU ещё **31 ms**.
5. **SPA `/` без build** — 404 (не capacity API).

---

## 2. Окружение

| Параметр | Значение |
|---|---|
| Target | `http://127.0.0.1:8080` |
| DB | PostgreSQL 16 local |
| Redis | local (rate-limit + cache **включены**) |
| `SKIP_PLAN_GATE` | `true` |
| Seed | clinic `loadtest@1dent.local`, **40 patients** |
| CPU / RAM | 4 / 16014 MB |
| Node / k6 | v22.14.0 / k6 v2.0.0 |

> Production (`https://www.1dent.kz`) **не** нагружался — только smoke health check для доступности.

---

## 3. Результаты по сценариям

### 3.1 Smoke — OK

1 VU × 30s · 321 req · 0% errors · p95 **4 ms** · checks 100%

Dashboard / patients / calendar batches: **14–27 ms**. Система жива.

### 3.2 Public / Health — DEGRADED (ложный сигнал SPA)

Ramping до ~300 RPS · 16590 req · **error 9.99%** · p95 **1 ms** · checks 100%

**Диагностика:** ~10% запросов шли на `/` (SPA). Frontend dist не собран → **404**, k6 считает это `http_req_failed`.  
`/api/healthz` и `/api/healthz/tma` отвечают **200** с субмиллисекундной latency.  
Сценарий обновлён: 404 SPA больше не считается fail.

**Вывод:** health-поверхность очень лёгкая; bottleneck не здесь.

### 3.3 Auth Login — BREAK по rate-limit (не CPU)

20 RPS × 90s · 1800 req · **error 98.89%** · checks 34%

**Диагностика (подтверждено curl):**
```
authRateLimit = 10 requests / 60 seconds / IP  (Redis)
→ после 10 успешных login остальные = 429 RATE_LIMIT_EXCEEDED
```

Latency успешных/rejected ответов низкая (p95 ~2 ms) — bcrypt не был bottleneck при этом профиле; сработал **лимит**.

**Вывод:** при Redis auth защищён агрессивно (10/min/IP). Для capacity-теста bcrypt нужен либо `REDIS_URL` off, либо распределённые IP / выше лимит на staging. Сценарий обновлён: 429 ожидаем и метрируем отдельно (`auth_rate_limited`).

### 3.4 CRM Browse — OK (рабочий профиль)

Ramp 0→50 VU · 37413 req · **0% errors** · p95 **6 ms** · ~125 RPS

| CRM batch | avg | p95 | max |
|---|---|---|---|
| Dashboard | 19 ms | 31 ms | 86 ms |
| Patients | 23 ms | 38 ms | 125 ms |
| Calendar | 13 ms | 23 ms | 75 ms |
| Analytics | 17 ms | 28 ms | 81 ms |

**Вывод:** типичная нагрузка клиники (десятки одновременных сессий) — комфортна.

### 3.5 Write Ops — OK

Ramp 0→30 writers · 10616 req · **0% errors** · p95 **7 ms**

Write flow (patient + note + status + procedure) p95 **22 ms**. Запись не узкое место при умеренной конкуренции и малом объёме данных.

### 3.6 Spike — OK с замедлением

10→100 VU spike · 31809 req · **0% errors** · p95 **339 ms** · ~244 RPS

| CRM batch | p95 | max |
|---|---|---|
| Patients | 1749 ms | 1903 ms |
| Dashboard | 1342 ms | 1465 ms |
| Calendar | 1203 ms | 1328 ms |

**Вывод:** flash crowd до 100 VU система пережила без 5xx, но CRM-экраны начинают «тормозить» (>1 s на batch).

### 3.7 Stress / Breakpoint — UX break, не HTTP break

Ramp → **250 VU** · 72804 req · **0% errors** · p95 **941 ms** · ~269 RPS

| CRM batch | avg | p95 | max |
|---|---|---|---|
| **Patients/kanban** | 2860 ms | **7203 ms** | 7806 ms |
| **Write flow** | 2359 ms | **5962 ms** | 7036 ms |
| Dashboard fan-out | 1518 ms | 3608 ms | 4508 ms |
| Calendar | 1266 ms | 3001 ms | 3472 ms |
| Analytics | 1259 ms | 2934 ms | 3517 ms |

**Точка UX-поломки (оценка):**
- **Комфорт:** ≤50 VU (p95 batch < 50 ms)
- **Приемлемо с запасом:** ~50–80 VU
- **Заметная деградация:** ~100 VU (batch 1–2 s) — spike
- **UX broken:** ≥150–250 VU (batch 3–7 s) — stress, при этом HTTP ещё 200

Жёсткий fail (5xx / connection reset / pool exhaustion) **не пойман** на 250 VU при seed=40. На prod-данных (тысячи пациентов) breakpoint будет раньше.

### 3.8 Soak — OK

25 VU × 5m · 19419 req · **0% errors** · p95 **20 ms**

Нет признаков утечки/деградации во времени на 5-минутном окне. Для реального soak рекомендуется 30–60 минут (`SOAK_DURATION=30m`).

### 3.9 Mixed — OK

Параллельно health + CRM read + write + auth · ~127 RPS · error **2.21%** (auth 429) · p95 **50 ms** · checks 97.7%

Реалистичный микс стабилен; единственный источник ошибок — rate-limited login.

---

## 4. Карта узких мест

| Приоритет | Зона | Симптом | Эндпоинты / код |
|---|---|---|---|
| P0 | Auth rate-limit | 429 при >10 login/min/IP | `authRateLimit` в `rate-limit.middleware.ts` |
| P1 | Patients list + detail fan-out | Самый медленный batch на stress (7 s) | `GET /api/patients`, `/:id`, treatment-plans, messages, financial-summary |
| P1 | Dashboard fan-out | 5–6 запросов на mount | `/analytics/owner/summary`, `/analytics`, `/kpi/doctors`, `/channels/stats`, notifications |
| P2 | Write path | Stage transitions + inserts | `POST /patients`, interactions, procedures |
| P2 | Analytics SQL | Растёт с объёмом данных | `/api/analytics/*` |
| P3 | SPA static | 404 без build | `/*` static serve |

```
HTTP 200 ───────────────────────────────► 250 VU (на этом стенде)
UX comfort ─────────► ~50 VU
UX degraded ───────────────► ~100 VU
UX broken ─────────────────────────► ~150–250 VU
Auth 429 wall (Redis) ─► >10 login/min/IP
```

---

## 5. Рекомендации

1. **Dashboard BFF** — один aggregate endpoint вместо 5–6 параллельных вызовов.
2. **Patients list** — пагинация / projection; не тянуть тяжёлые агрегаты на каждый kanban refresh.
3. **Postgres pool** — мониторить `pg_stat_activity` и pool size при >100 VU; default `max_connections=100`.
4. **Redis обязателен в prod** — rate-limit auth + analytics cache; без Redis лимит login отключается.
5. **Auth capacity test** — отдельно, с отключённым rate-limit или multi-IP, чтобы мерить bcrypt.
6. **Staging с prod-like data** — 10k+ patients / procedures; текущий seed=40 занижает стоимость SQL.
7. **Readiness probe** — не только `/api/healthz` (он не проверяет DB); добавить DB-backed ready.
8. **Horizontal scale** — API stateless (JWT); масштабировать web, DB — следующий bottleneck.

---

## 6. Как воспроизвести

```bash
export DATABASE_URL=postgresql://onedent:onedent@127.0.0.1:5432/onedent
export JWT_SECRET=k6-load-test-secret REDIS_URL=redis://127.0.0.1:6379
export SKIP_PLAN_GATE=true NODE_ENV=development PORT=8080
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start &

./load-tests/scripts/run-all.sh
# отчёт: load-tests/reports/LOAD_TEST_REPORT.md
```

Один сценарий:
```bash
node load-tests/scripts/seed-loadtest-data.mjs
k6 run load-tests/k6/scenarios/stress.js --no-thresholds
```

Сырые JSON: `load-tests/reports/raw/*-summary.json`.

---

## 7. Ограничения этого прогона

- Локальный single-node, не Railway/Render prod sizing.
- Seed: 40 patients — запросы дешевле, чем в реальной клинике.
- Frontend SPA не собран → `/` = 404.
- Soak 5 минут (не 30+).
- Auth сценарий упёрся в rate-limit, не в bcrypt throughput.
- Внешние интеграции (WhatsApp/OpenRouter/Telegram) не нагружались.
