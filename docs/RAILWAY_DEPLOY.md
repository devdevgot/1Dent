# Деплой 1Dent на Railway

Репозиторий использует ветку **`master`** (не `main`).

## Почему Railway не деплоит после push в master

Чаще всего одна из причин:

1. **В GitHub нет секрета `RAILWAY_DEPLOY_HOOK`** — job «Deploy to Railway» падает, деплой не запускается.
2. **В Railway отключён auto-deploy** — по инструкции CI/CD его выключали, но hook не добавили → деплоев нет вообще.
3. **Railway смотрит не на ту ветку** — в настройках сервиса должна быть ветка `master`.
4. **GitHub не подключён к сервису Railway** — репозиторий `devdevgot/1Dent` не привязан.

## Вариант A (рекомендуется): auto-deploy Railway + проверки в GitHub Actions

1. Railway → сервис **1dent** → **Settings** → **Source**
2. Подключить GitHub-репозиторий `devdevgot/1Dent`
3. **Production branch:** `master`
4. **Auto-deploy:** включён (Deploy on push)
5. GitHub Actions только собирает проект (job Checks); деплой делает Railway сразу после push

Секрет `RAILWAY_DEPLOY_HOOK` **не нужен**.

## Вариант B: деплой только после успешных проверок (deploy hook)

1. Railway → сервис → **Settings** → **Deploy Hook** → сгенерировать URL
2. GitHub → **Settings** → **Secrets and variables** → **Actions** → секрет:
   - Имя: `RAILWAY_DEPLOY_HOOK`
   - Значение: URL из Railway
3. Railway → **Settings** → **Source** → **отключить** auto-deploy (чтобы не было двойного деплоя)
4. Push в `master` → GitHub Actions (Checks) → при успехе POST на hook → Railway деплоит

## Проверка

```bash
# Локально
bash scripts/deploy-build.sh

# Или через Railway CLI (если настроен)
bash scripts/railway-deploy.sh
```

После деплоя: `https://1dent.kz/api/healthz` должен отвечать `200`.

## Переменные окружения на Railway

| Переменная | Значение |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | случайная строка 64+ символов |
| `FRONTEND_URL` | `https://1dent.kz` |
| `PUBLIC_URL` | `https://1dent.kz` |

Build: `bash ./scripts/deploy-build.sh` (из `railway.toml`)  
Start: `pnpm --filter @workspace/api-server run start`
