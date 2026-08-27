# ProcessMap / Food Process Copilot

ProcessMap — веб-приложение для моделирования бизнес-процессов в нотации BPMN с ИИ-ассистентом.

## Архитектура

- **api** — FastAPI backend (Python). Единая точка входа для `/api/*` и `/version`.
- **frontend** — Vite + React SPA, отдаётся через nginx.
- **postgres** — primary runtime DB.
- **redis** — runtime cache, locks, jobs queue.
- **gateway** — nginx reverse-proxy, единая точка входа для браузера.
- **agent** — отдельный agent-сервис (внутри docker-сети, `LLM_VIA_AGENT_SVC=0` по умолчанию).
- **notifications** — сервис уведомлений.
- **celery-worker** — фоновая обработка.

## Локальный запуск

```bash
cp .env.example .env
# при необходимости отредактируйте .env
docker compose up --build
```

- Frontend UI: `http://localhost:${FRONTEND_PORT:-5177}`
- Backend API: `http://localhost:${HOST_PORT:-8011}/api`
- `/version`: `http://localhost:${HOST_PORT:-8011}/version`

Если ранее использовался сервис `app`, запустите один раз:

```bash
docker compose up -d --remove-orphans
```

## Среды

- **Stage:** `https://stage.processmap.ru`
- **Prod:** `https://processmap.ru`

## Деплой

Деплой stage и prod выполняется **только вручную на сервере** через `deploy/deploy.sh` (или эквивалентный ручной сценарий владельца/ops).

GitHub Actions workflow `.github/workflows/deploy-stage.yml` переименован в **«Deploy to Stage»** и содержит дисклеймер: авто-деплой по `push` в `main` — это legacy-контур, который деплоит на хост из `STAGE_HOST`, но канонический stage/prod deploy — ручной через `deploy/deploy.sh`.

Проверка перед деплоем:

```bash
./verify-deploy.sh   # должен напечатать MATCH
```

По умолчанию `verify-deploy.sh` сверяет локальный HEAD с `https://stage.processmap.ru/version`.

## Регламент контуров

- Один контур = одна ветка от `origin/main`.
- Новая фича / новый баг = отдельная ветка, без смешивания изменений.
- Review обязателен; merge в `main` — только после явного approve пользователя.
- Release flow:
  ```
  branch -> push -> PR -> user approval -> merge -> verify locally/stage -> manual prod deploy (from main only)
  ```

## Переменные окружения

Основные переменные см. в `.env.example`:

- `HOST_PORT` — порт backend на хосте (в контейнере всегда 8000).
- `FRONTEND_PORT` — порт gateway/UI на хосте.
- `JWT_SECRET` — секрет подписи JWT.
- `JWT_ACCESS_TTL_MIN` / `JWT_REFRESH_TTL_DAYS` — TTL токенов.
- `COOKIE_SECURE` / `COOKIE_SAMESITE` — настройки cookie.
- `DEV_SEED_ADMIN` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` — dev-учётка.
- `FPC_DB_BACKEND` / `DATABASE_URL` — выбор DB backend.
- `REDIS_URL` / `REDIS_REQUIRED` — Redis runtime policy.
- `AGENT_SVC_URL` / `AGENT_SVC_INTERNAL_TOKEN` / `LLM_VIA_AGENT_SVC` — agent-сервис.
- `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` — LLM-интеграция.

## Структура репозитория

```
backend/          # FastAPI backend, alembic, тесты, сервисы
frontend/         # Vite/React SPA
deploy/           # деплой-скрипты, nginx-конфиги, systemd
docs/openapi.yaml # OpenAPI-снапшот (используется CI contract-тестами)
scripts/          # вспомогательные скрипты CI (dump_openapi, update_openapi, api_coverage_report)
design-system/    # дизайн-токены и гайдлайны TO BE
```

## Обновление OpenAPI-спеки

Любой PR, меняющий HTTP-эндпоинты, обязан обновить `docs/openapi.yaml`:

```bash
make openapi
# или
./scripts/update_openapi.sh
```

Скрипт выполнит:
1. Дамп живой спеки из `app.openapi()` через `scripts/dump_openapi.py`.
2. Линт `@redocly/cli lint docs/openapi.yaml` (в Docker, если `npx` недоступен).
3. Вывод статистики: количество paths/operations до и после.

CI job `spec-drift` в `.github/workflows/backend-contract.yml` блокирует PR, если живая спека расходится с `docs/openapi.yaml`. Breaking-изменения требуют маркера `BREAKING-API-OK` в описании PR.

Legacy-артефакты (`.planning/`, `archive/`, `backups/`, `obsidian/`, `vault/`, `zip/`, `tools/rag/`, корневые audit-отчёты и т.п.) удалены из `main-v2` и остаются в истории `archive/v1`.
