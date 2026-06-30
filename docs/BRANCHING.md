# Ветки и релизный процесс

## Ветки

| Ветка | Назначение |
|-------|------------|
| **`master`** | Production. Сюда попадает только проверенный код. Деплой на Railway/Render с этой ветки. |
| **`dev`** | Staging / интеграция. Сюда сливаются все фичи перед релизом в `master`. |
| **`cursor/*`** | Рабочие ветки агентов и разработчиков. |

## Поток изменений

```
cursor/feature-xyz  →  PR  →  dev  →  PR  →  master  →  production deploy
```

1. Создайте ветку от `dev` (или от `master`, если `dev` ещё не обновлена).
2. Откройте **PR в `dev`** — CI (сборка) запустится автоматически.
3. После ревью и тестов — merge в `dev`.
4. Когда готов релиз — откройте **PR `dev` → `master`**.
5. Merge в `master` → production deploy (если настроен auto-deploy или deploy hook).

## CI/CD

- **Push / PR в `dev`** — только job `Checks` (install + build).
- **Push в `master`** — `Checks` + `Deploy to Railway` (если настроен hook).

## Рекомендации

- Не пушить напрямую в `master`, кроме hotfix.
- Периодически синхронизировать `dev` с `master` после релиза:
  ```bash
  git checkout dev
  git pull origin dev
  git merge origin/master
  git push origin dev
  ```
- Для hotfix в production: ветка от `master` → PR в `master` → затем cherry-pick или merge `master` в `dev`.

## Railway / Render

Production-окружения должны следить за веткой **`master`**.  
Опционально можно поднять отдельный staging-сервис на ветке **`dev`** (в настройках сервиса → Branch).
