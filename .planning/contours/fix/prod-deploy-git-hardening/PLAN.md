# Контур: fix/prod-deploy-git-hardening

## Цель

Устранить split-brain деплоя и привести pipeline к единому источнику правды:
- один BUILD_ID (`/opt/processmap/env/prod.env`);
- одинаковый полный набор сервисов в `deploy-prod.yml` и `deploy/deploy.sh`;
- изолированный stage checkout;
- явные guard'ы и rollback-путь;
- запрет ручного запуска `deploy.sh` на проде вне runbook/workflow.

## Факты из approved audit/prod-deploy-incident-audit

- Root cause вчерашнего инцидента — split-brain: CI задеплоил `0e97d28e`, затем ручные запуски `deploy/deploy.sh` на сервере (`00:12/00:13/00:57`) пересобрали `api/frontend/agent/notifications` из `95fc4d89`, а `gateway` и `celery-worker` остались на `0e97d28e`. Celery отбрасывает задачи (`Received unregistered task 'app.tasks.render_overlay_task'`).
- Два источника `BUILD_ID`: `/opt/processmap/env/prod.env` (`0e97d28e`) и git-ignored `/opt/processmap/app/.env` (`95fc4d89`). Ручные правки невидимы для `git status`.
- Stage и prod делят один checkout `/opt/processmap/app`: `deploy-stage.yml` делает `git checkout -f <SHA>` и мутирует дерево под volume-mount'ами прода.
- `rollback-prod.yml` откатывает только `api` и `gateway`, не `celery-worker`.
- `deploy/deploy.sh` и `deploy-prod.yml` собирают разные подмножества сервисов.
- На сервере лежат артефакты ручного восстановления: `.env.emergency-bak-*`, `docker-compose.*.bak.*`; orphan checkout `/home/deploy/app` (`1b610d9`).
- `origin/main = ffaaa38f`.

## Изменения

### 1. `docker-compose.prod.yml` — единый источник env

Добавить `env_file: !override ["/opt/processmap/env/prod.env"]` для сервисов, которые читают runtime `BUILD_ID`:
- `api`
- `celery-worker`
- `agent`
- `notifications`

Это гарантирует, что `/version` и `/api/health` читают только `/opt/processmap/env/prod.env`, а не git-ignored `.env`.

### 2. `deploy-prod.yml` — единый BUILD_ID и полный набор сервисов

- Убрать запись `BUILD_*` в `/opt/processmap/app/.env`.
- Сохранить запись `BUILD_*` только в `/opt/processmap/env/prod.env`.
- Добавить guard: `COMPOSE_PROJECT_NAME` должен быть `app`; иначе `exit 1`.
- Явный лог: текущий SHA сервера (HEAD) → целевой SHA (`origin/main`).
- Единый набор сервисов для `build` и `up`: `api`, `gateway`, `celery-worker`, `agent`, `notifications`, `frontend`.
- Partial deploy = fail: если какой-то сервис не собрался/не поднялся — `exit 1`.
- Post-deploy автозапуск `prod-deploy-verify.yml` через reusable workflow `uses:`.
- При провале verify — автоматический rollback через `gh workflow run rollback-prod.yml` (или fail + явная инструкция; выбрать минимальное, обосновать в PR).
- Обновить freshness proof: проверять SHA не только `api` и `gateway`, но и `celery-worker` (логи/метки).

### 3. `deploy/deploy.sh` — guard'ы и единый набор

- Убрать запись `BUILD_*` в `.env`.
- Запретить запуск в production-окружении без явного флага `--prod-local`:
  - если `COMPOSE_PROJECT_NAME=app` и нет флага → fail с инструкцией запускать только через workflow/runbook.
- Единый набор сервисов: `api`, `frontend`, `agent`, `notifications`, `celery-worker`.
- Сохранить deprecated-container rollback для dev/тестов.

### 4. `rollback-prod.yml` — откат всех сервисов

- Добавить rollback-образы для `celery-worker`, `agent`, `notifications`, `frontend`.
- Пересоздать все сервисы (`api`, `gateway`, `celery-worker`, `agent`, `notifications`, `frontend`) на rollback-образах.
- Сохранить `BUILD_ID` в `/opt/processmap/env/prod.env` равным SHA rollback-образа.

### 5. `deploy-stage.yml` — изоляция stage

- Переехать в `/opt/processmap-stage/app` (новый checkout, bootstrap через `git clone`/`git worktree add` или отдельный clone).
- Использовать `COMPOSE_PROJECT_NAME=processmap_stage` и `.env.stage` внутри `/opt/processmap-stage/app`.
- Больше не трогать `/opt/processmap/app`.
- Изменения только в workflow + документированная процедура переключения; на сервере ничего не выполнять.

### 6. `verify-deploy.sh` — проверка консистентности SHA

- Добавить функцию проверки SHA всех контейнеров проекта (api, gateway, celery-worker, agent, notifications, frontend) через labels/env/логи.
- Проверять, что `BUILD_ID` в `/version` совпадает с целевым SHA.
- Проверять отсутствие `unregistered task` в логах `celery-worker`.

### 7. `scripts/tests/test_verify_deploy.sh` — тесты guard'ов

- Тест `normalize_sha`.
- Тест `detect_compose_project`.
- Тест `check_agent_container`.
- Новые тесты:
  - guard `COMPOSE_PROJECT_NAME=app`;
  - единый список сервисов (api/gateway/celery-worker/agent/notifications/frontend).

### 8. `RUNBOOK.md` — «Падение прода"

- Диагностика split-brain: как проверить SHA всех сервисов и `BUILD_ID`.
- Выравнивающий деплой (запуск `deploy-prod.yml`).
- Rollback через `rollback-prod.yml`.
- Эскалация.
- Явный запрет: ручной запуск `deploy.sh` на сервере вне пайплайна — только через workflow или runbook-процедуру.

## Acceptance criteria

- [ ] `deploy-prod.yml` не пишет в `/opt/processmap/app/.env`.
- [ ] `deploy-prod.yml` пишет `BUILD_ID` только в `/opt/processmap/env/prod.env`.
- [ ] `docker-compose.prod.yml` override'ит `env_file` для `api`, `celery-worker`, `agent`, `notifications` на `/opt/processmap/env/prod.env`.
- [ ] `deploy-prod.yml` и `deploy/deploy.sh` используют одинаковый полный набор сервисов.
- [ ] `deploy-prod.yml` guard `COMPOSE_PROJECT_NAME=app`.
- [ ] `deploy/deploy.sh` guard: отказ при `COMPOSE_PROJECT_NAME=app` без `--prod-local`.
- [ ] `rollback-prod.yml` откатывает все сервисы, включая `celery-worker`.
- [ ] `deploy-stage.yml` использует `/opt/processmap-stage/app` и не трогает `/opt/processmap/app`.
- [ ] `verify-deploy.sh` проверяет SHA всех сервисов.
- [ ] Shell-тесты проходят.
- [ ] Workflow syntax-check проходит (`actionlint` или `grep`/`yq`).
- [ ] PR на русском с описанием, чек-листом, rollback-заметками и планом drift-ликвидации создан, но не смержен.

## Drift-ликвидация (только план в PR)

- `.env.emergency-bak-*`: сравнить с `/opt/processmap/env/prod.env`; если дублируют — удалить вручную ops после merge.
- `docker-compose.*.bak.*`: сравнить с git-версией; если не нужны — удалить.
- `/home/deploy/app`: проверить, что он не используется runtime (`ps`, compose labels); удалить как orphan ops-по запросу.

## Риски

- `docker compose` версии на сервере должна поддерживать `!override` (уже используется для `ports`).
- Изменение `env_file` может повлиять на dev-запуск, если кто-то использует `docker-compose.prod.yml` локально. Ограничиваем override только прод-сервисами.
- Stage-изоляция потребует ручного bootstrap'а `/opt/processmap-stage/app` при первом деплое после merge.

## Не входит в контур

- Исправление `runc`/`containerd`/`seccomp` — отдельный ops-контур `seccomp-runtime-remediation`.
- Удаление файлов на сервере — только план в PR, выполнение ops вручную.
