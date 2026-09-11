# READY FOR REVIEW — Notifications Microservice

## Что сделано

- [x] Архитектурное решение (HTTP REST) задокументировано в `SOLUTION.md`.
- [x] Создан отдельный FastAPI-сервис `backend/services/notifications/`.
- [x] Реализованы 3 домена: `error_events`, `notifications`, `system_events`.
- [x] Для каждого домена: DTO, repo, CRUD endpoints в сервисе, proxy endpoints в монолите.
- [x] Unit tests сервиса: `18 passed`.
- [x] Root `docker-compose.yml` обновлён (сервис `notifications`, порт 8008).
- [x] Nginx config обновлён (`/api/notifications/` → сервис).
- [x] CI/CD `deploy-stage.yml` обновлён (build + up notifications).
- [x] Монолит делегирует запросы в сервис по HTTP с fallback на локальный repo.
- [x] Regression tests монолита: `25 passed`.
- [x] Проверено на `clearvestnic.ru:5177` для всех 3 доменов.
- [x] Fallback при недоступности сервиса проверен для всех 3 доменов.

## Что НЕ делалось

- [ ] Frontend не менялся.
- [ ] Схема БД не менялась (общая PostgreSQL, новые таблицы создаются `CREATE TABLE IF NOT EXISTS`).
- [ ] Prod deploy не выполнялся.
- [ ] `/api/admin/error-events*` остались в монолите (read-only).

## Артефакты

- `AUDIT.md`
- `5-PLANE.md`
- `SOLUTION.md`
- `VERIFICATION.md`
- `EXEC_REPORT.md`
- `READY_FOR_REVIEW.md`
- `STATE.json`

## Рекомендации перед merge

1. Провести code-review SQL-запросов в `*_repo.py` (placeholders `?` → `%s` для postgres).
2. Убедиться, что `JWT_SECRET` в stage/prod env переопределён.
3. Решить, нужно ли переводить `/api/admin/error-events*` на сервис.
4. В production добавить dedicated nginx gateway вместо Vite-proxy.

## Approve?

Если всё ок — можно merge'ить в `main` и деплоить на stage.
