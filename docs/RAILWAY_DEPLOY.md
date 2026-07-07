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

После деплоя: `https://www.1dent.kz/api/healthz` должен отвечать `200`.

## Переменные окружения на Railway

### Project token (для CLI / Cloud Agent)

1. Railway → проект **1Dent** → **Settings** → **Tokens**
2. Создать токен для окружения **production**
3. Сохранить как секрет `RAILWAY_TOKEN` (именно project token, не account token)

Проверка:

```bash
export RAILWAY_TOKEN="<token>"
bash scripts/railway-vars-production.sh   # все переменные + redeploy
bash scripts/railway-deploy.sh            # деплой текущего кода
```

Скрипт `railway-vars-production.sh` читает секреты из env (`JWT_SECRET`, `OPENROUTER_API_KEY`, R2-ключи и т.д.) и пропускает незаданные.

| Переменная | Значение |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | случайная строка 64+ символов |
| `FRONTEND_URL` | `https://www.1dent.kz` |
| `PUBLIC_URL` | `https://www.1dent.kz` (должен совпадать с `FRONTEND_URL`, включая `www`) |
| `WEBHOOK_BASE_URL` | `https://www.1dent.kz` (опционально; если не задан — берётся `PUBLIC_URL` / `FRONTEND_URL`, не `*.up.railway.app`) |
| `PLATFORM_TG_BOT_TOKEN` | токен **платформенного** бота из [@BotFather](https://t.me/BotFather) |
| `PLATFORM_SUPERADMIN_TG_ID` | ваш числовой Telegram ID (первый суперадмин) |

### Telegram Mini App (TMA) — если не открывается в Telegram

TMA — это веб-приложение по адресу `https://www.1dent.kz/tg-admin/`, которое открывается из **платформенного** бота (не из клинического WhatsApp-бота).

**Да, токен бота нужно добавить в Railway** — без него сервер не регистрирует webhook и кнопку меню, а API отвечает `503 Platform bot not configured`.

#### 1. Переменные на Railway (сервис `1dent`, окружение Production)

| Переменная | Зачем |
|---|---|
| `PLATFORM_TG_BOT_TOKEN` | Токен бота от BotFather; проверка подписи `initData` и регистрация webhook |
| `PLATFORM_SUPERADMIN_TG_ID` | Ваш Telegram user ID — без него после открытия будет «Доступ запрещён» |
| `WEBHOOK_BASE_URL` | `https://www.1dent.kz` — от него строятся URL webhook и кнопки «Панель управления» |
| `FRONTEND_URL`, `PUBLIC_URL` | `https://www.1dent.kz` |

После добавления переменных — **Redeploy** сервиса.

Быстро через CLI (если есть `RAILWAY_TOKEN`):

```bash
export RAILWAY_TOKEN="<project-token>"
export PLATFORM_TG_BOT_TOKEN="123456:ABC..."
export PLATFORM_SUPERADMIN_TG_ID="123456789"
bash scripts/railway-vars-production.sh
```

#### 2. Проверка после деплоя

1. В браузере открывается: `https://www.1dent.kz/tg-admin/` (должен быть HTML, не 502/timeout).
2. Диагностика: `https://www.1dent.kz/api/healthz/tma` → `tma.staticReady: true`, `tma.url: https://www.1dent.kz/tg-admin/`.
3. Health: `https://www.1dent.kz/api/healthz` → `200`.
4. В логах Railway при старте:
   - `[PlatformBot] Webhook registered`
   - `[PlatformBot] Menu button set`
5. Если вместо этого `[PlatformBot] PLATFORM_TG_BOT_TOKEN not set` — токен не задан или деплой старый.

#### 3. BotFather (если кнопка меню не появляется)

1. Откройте [@BotFather](https://t.me/BotFather) → ваш платформенный бот.
2. **Bot Settings → Menu Button → Configure menu button** → URL: `https://www.1dent.kz/tg-admin/`
3. **Bot Settings → Domain** → укажите `www.1dent.kz` (должен совпадать с хостом в URL Web App).

Сервер при старте сам вызывает `setChatMenuButton` и `setWebhook`, но ручная настройка в BotFather не мешает.

#### 4. Как открыть TMA

- Напишите боту `/start` или нажмите кнопку меню **«Панель управления»** (слева от поля ввода).
- Открывать нужно именно **платформенного** бота, не бота клиники.

#### 5. Типичные симптомы

| Симптом | Причина |
|---|---|
| Белый экран / «не удалось открыть» | Сайт недоступен, URL в BotFather без `www` (или наоборот), или нет HTTPS |
| Бесконечная «Загрузка...» | API не отвечает или `DATABASE_URL` не настроен |
| «Доступ запрещён» | TMA открылась, но ваш Telegram ID не в `PLATFORM_SUPERADMIN_TG_ID` и не в таблице `platform_admins` |
| `Platform bot not configured` | Нет `PLATFORM_TG_BOT_TOKEN` на Railway |

Узнать свой Telegram ID: [@userinfobot](https://t.me/userinfobot) или [@getmyid_bot](https://t.me/getmyid_bot).

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
