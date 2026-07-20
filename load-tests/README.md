# 1Dent Load Tests (k6)

Нагрузочные сценарии всей системы 1Dent через [k6](https://k6.io/).

## Сценарии

| Сценарий | Файл | Что проверяет |
|----------|------|----------------|
| Smoke | `k6/scenarios/smoke.js` | Базовая живость API + CRM reads |
| Public/Health | `k6/scenarios/public-health.js` | `/api/healthz`, TMA health, SPA |
| Auth Login | `k6/scenarios/auth-login.js` | Concurrent login (bcrypt) |
| CRM Browse | `k6/scenarios/crm-browse.js` | Dashboard / patients / calendar / analytics |
| Write Ops | `k6/scenarios/write-ops.js` | Создание пациентов и процедур |
| Spike | `k6/scenarios/spike.js` | Резкий всплеск до 100 VU |
| Stress | `k6/scenarios/stress.js` | Ramp до 250 VU — точка поломки |
| Soak | `k6/scenarios/soak.js` | Длительная умеренная нагрузка |
| Mixed | `k6/scenarios/mixed.js` | Реалистичный микс потоков |

Отчёт: `reports/LOAD_TEST_REPORT.md` (после `scripts/run-all.sh`).

## Быстрый старт

```bash
# 1. Postgres + Redis
# 2. API
export DATABASE_URL=postgresql://onedent:onedent@127.0.0.1:5432/onedent
export JWT_SECRET=k6-load-test-secret
export REDIS_URL=redis://127.0.0.1:6379
export SKIP_PLAN_GATE=true
export NODE_ENV=development
export PORT=8080
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start &

# 3. Suite
./load-tests/scripts/run-all.sh
```

Один сценарий:

```bash
export BASE_URL=http://127.0.0.1:8080 AUTH_EMAIL=loadtest@1dent.local AUTH_PASSWORD='LoadTest1!'
node load-tests/scripts/seed-loadtest-data.mjs
k6 run load-tests/k6/scenarios/crm-browse.js
```

## Важно

- Не гоняйте stress/spike против production (`www.1dent.kz`) без явного разрешения.
- Для load-тестов используйте Bearer JWT (`AUTH_TOKEN`), не cookie (`secure` cookie неудобна на http://localhost).
- `SKIP_PLAN_GATE=true` или `POST /api/auth/start-trial` нужны, иначе CRM вернёт `402`.
