# Нагрузочное тестирование 1Dent

Скрипты [k6](https://k6.io/) для оценки пропускной способности production/staging.

## Запуск

```bash
# Установить k6 (Debian/Ubuntu)
sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg <(curl -s https://dl.k6.io/key.gpg)
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install -y k6

# Тест 1: точка отказа HTTP-слоя (healthz, без БД)
k6 run scripts/load-test/k6-breakpoint.js

# Тест 2: реалистичная сессия CRM (health + SPA + auth probe)
k6 run scripts/load-test/k6-scenarios.js

# Другой хост (staging)
BASE_URL=https://staging.example.com k6 run scripts/load-test/k6-scenarios.js
```

## Результаты (2026-07-10, production `https://www.1dent.kz`)

### Breakpoint — `GET /api/healthz`

| Метрика | Значение |
|---------|----------|
| Пиковая нагрузка | 200 req/s |
| Ошибки | 0% |
| p95 latency | 81 ms |
| max latency | 441 ms |
| VU для 200 rps | ~16 |

### CRM-сессия — 100 sustained + spike 150 VU

| Метрика | Значение |
|---------|----------|
| healthz p95 | 83 ms |
| SPA index p95 | 85 ms |
| Ошибки health/SPA | 0% |
| Пик VU | 149 |

Сценарий имитирует: открытие приложения, health-check, пауза 2–5 с между действиями.

**Ограничение:** без JWT нельзя нагрузить `/api/patients`, аналитику и другие DB-heavy эндпоинты на production.

## Архитектурные лимиты (код)

| Фактор | Текущее значение | Влияние |
|--------|------------------|---------|
| `pg.Pool` | `max` не задан → **10** соединений | Главный bottleneck для CRM API |
| Plan gate | SQL на каждый auth-запрос | +1 query к БД на запрос |
| Деплой | 1 Node-процесс (monolith) | Нет горизонтального масштабирования |
| Render blueprint | `starter` + Postgres `basic_256mb` | ~512 MB RAM, 0.5 CPU |

## Рекомендации по ёмкости

| Сценарий | Оценка |
|----------|--------|
| Одновременно **активных** пользователей CRM (кликают, сохраняют, канбан) | **25–40** без заметных лагов |
| Одновременных **сессий** (вкладка открыта, лёгкая навигация) | **100–150** |
| Пик HTTP (health, статика) | **200+ req/s** |
| Зарегистрированных клиник/пользователей (не все онлайн) | Сотни при типичном распределении нагрузки |

### Как увеличить лимит

1. `pool.max: 20–30` в `lib/db/src/index.ts` (согласовать с лимитом Postgres)
2. Апгрейд инстанса (1–2 vCPU, 1–2 GB RAM)
3. Кэш plan-gate в Redis (TTL 60 s)
4. Read replica для отчётов/аналитики
5. Горизонтальное масштабирование (2+ инстанса + sticky sessions или stateless JWT)
