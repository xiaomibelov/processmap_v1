# NOGO.md — запрещённые действия на продакшн-сервере

Контур `audit/session-delete-not-found` — **read-only**. Никаких изменений на `deploy@45.87.104.206` без явного written approve пользователя производить нельзя.

## 1. База данных

- ❌ `REINDEX`, `REINDEX SYSTEM`, `REINDEX TABLE`, `VACUUM FULL`, `CLUSTER`, `TRUNCATE` без полного бэкапа и approve.
- ❌ `CREATE INDEX`, `DROP INDEX`, `ALTER TABLE` на production БД.
- ❌ Любые `UPDATE`, `DELETE`, `INSERT` в таблицы `sessions`, `users`, `orgs`, `org_memberships`, `project_memberships`, `audit_log`, `error_events`.
- ❌ Ручное удаление или переименование сессий через SQL / psql.
- ❌ Запуск `pg_resetwal`, `pg_rewind`, `initdb`.

## 2. Приложение / Docker

- ❌ Перезапуск контейнеров `app-api-1`, `app-postgres-1`, `app-frontend-1`, `app-celery-worker-1`, `app-gateway-1`, `app-redis-1`.
- ❌ `docker compose up -d --force-recreate`, `docker compose down`, `docker system prune`.
- ❌ Изменение `.env`, `docker-compose.yml`, `deploy/nginx/*.conf`.
- ❌ Изменение файлов в `/opt/processmap/app/backend` или `/opt/processmap/app/frontend`.
- ❌ Сборка и деплой нового Docker-образа в production.

## 3. Код

- ❌ Коммит, пуш, merge, deploy ветки `fix/bpmn-drilldown-ui` или любой другой ветки на production без отдельного approve (см. AGENTS.md §7).
- ❌ Применение `overlay_cache_patch` или любых других патчей на production.
- ❌ Изменение `AGENTS.md`, `SKILL.md` или других discipline-файлов без согласования.

## 4. Тестирование / воспроизведение

- ❌ Запись новых тестовых сессий в production БД.
- ❌ Выполнение мутационных запросов к production API для "проверки".
- ❌ Нагрузочное тестирование на production.

## 5. Что можно делать (read-only)

- ✅ SELECT-запросы к БД для диагностики.
- ✅ Чтение логов контейнеров (`docker logs --tail=...`).
- ✅ Чтение файлов конфигурации и кода.
- ✅ Создание audit-артефактов в `/opt/processmap-test/.planning/contours/audit/session-delete-not-found/`.
- ✅ Любые действия на изолированном test stand `processmap_stage` — только после подтверждения, что это stage, а не prod.

## 6. Условия снятия NOGO

Пользователь должен явно approve (в тексте этого чата) одно или несколько из следующих действий:

1. Создание полного бэкапа БД и последующий `REINDEX SYSTEM processmap`.
2. Перезапуск контейнеров после восстановления индексов.
3. Применение кода-фиксов (router delete, RBAC, логирование) через stage → prod rollout.
4. Ручное удаление/переименование конкретных сессий по списку.

До получения approve audit остаётся read-only.
