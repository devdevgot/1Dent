# Деплой 1Dent на Railway

Репозиторий использует ветки **`dev`** (staging) и **`master`** (production, не `main`).  
См. [BRANCHING.md](./BRANCHING.md).

## Почему Railway не деплоит после push в master

Чаще всего одна из причин:

1. **В GitHub нет секрета `RAILWAY_DEPLOY_HOOK`** — job «Deploy to Railway» падает, деплой не запускается.
2. **В Railway отключён auto-deploy** — по инструкции CI/CD его выключали, но hook не добавили → деплоев нет вообще.
3. **Railway смотрит не на ту ветку** — в настройках сервиса должна быть ветка `master`.
4. **GitHub не подключён к сервису Railway** — репозиторий `devdevgot/1Dent` не привязан.

## «Github repo not found» при выборе ветки

Это **не ошибка кода** — Railway потерял доступ к репозиторию или использует устаревший кэш GitHub App.

**Правильные данные репозитория:**
- Owner: `devdevgot`
- Repo: `1Dent` (с заглавной **D**)
- URL: https://github.com/devdevgot/1Dent
- Ветка по умолчанию: **`master`** (не `main`)

### Шаг 1 — доступ Railway App к репозиторию

1. Откройте: https://github.com/settings/installations
2. Найдите **Railway** → **Configure**
3. **Repository access:**
   - либо **All repositories**
   - либо **Only select repositories** → добавьте **`devdevgot/1Dent`**
4. Сохраните

Если репозиторий в **организации** — админ org должен одобрить Railway App в настройках организации.

### Шаг 2 — переподключить GitHub в Railway

1. https://railway.com/account → **GitHub** → **Disconnect**
2. Снова **Connect GitHub** (войдите тем же аккаунтом, где есть `devdevgot/1Dent`)
3. Проект → сервис **1dent** → **Settings** → **Source**
4. **Disconnect** старый source (если есть)
5. **Connect Repo** → `devdevgot` / `1Dent` → ветка **`master`**

### Шаг 3 — если не помогло (полный сброс)

1. GitHub → **Settings** → **Applications** → **Railway** → **Revoke** / удалить установку
2. Установить заново: https://github.com/apps/railway-app/installations/new
3. Выдать доступ к `devdevgot/1Dent`
4. Railway → **Account** → переподключить GitHub
5. В сервисе заново выбрать репозиторий и ветку `master`

### Шаг 4 — обход без GitHub (пока чините интеграцию)

**Deploy Hook** (не требует выбора ветки в UI):

1. Railway → сервис → **Settings** → **Deploy Hook** → скопировать URL
2. GitHub → **Secrets** → `RAILWAY_DEPLOY_HOOK` = этот URL
3. Push в `master` → GitHub Actions вызовет hook → деплой пойдёт

**Или Railway CLI** с локальной машины:

```bash
bash scripts/railway-setup.sh   # один раз
bash scripts/railway-deploy.sh    # деплой текущего кода
```

`railway up` загружает код напрямую, без привязки ветки в dashboard.

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

### Cloudflare R2 (видео планшета + файлы)

| Переменная | Значение |
|---|---|
| `R2_ACCOUNT_ID` | `81fb0846943c98f6dabf2881deccb7f4` |
| `R2_BUCKET_NAME` | `onedent` |
| `R2_ENDPOINT` | `https://81fb0846943c98f6dabf2881deccb7f4.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | из Cloudflare R2 API Token |
| `R2_SECRET_ACCESS_KEY` | из Cloudflare R2 API Token |
| `PRIVATE_OBJECT_DIR` | `private` |
| `PUBLIC_OBJECT_SEARCH_PATHS` | `public` |
| `R2_PUBLIC_URL` | опционально: custom domain bucket (CDN) |

Быстрая настройка (после создания R2 API token):

```bash
export R2_ACCESS_KEY_ID="..."
export R2_SECRET_ACCESS_KEY="..."
bash scripts/railway-r2-setup.sh
```

Build: `bash ./scripts/deploy-build.sh` (из `railway.toml`)  
Start: `pnpm --filter @workspace/api-server run start`

## Staging (ветка `dev`)

Можно поднять **отдельный сервис** Railway с веткой `dev` (Settings → Source → Branch: `dev`).

Чтобы на staging не блокировал истёкший пробный период / тариф (только dev, **не** production):

| Переменная | Значение | Где действует |
|---|---|---|
| `SKIP_PLAN_GATE` | `true` | API — пропускает `plan-gate` middleware |
| `VITE_SKIP_PLAN_PAYWALL` | `true` | CRM — не показывает экран «тариф не подключён» |

**Важно:** эти переменные задаются **только на staging-сервисе**. На production (`master`) их **не добавлять** — тарифная защита останется включённой.

После добавления переменных — **Redeploy** staging-сервиса (для `VITE_*` нужна пересборка).
