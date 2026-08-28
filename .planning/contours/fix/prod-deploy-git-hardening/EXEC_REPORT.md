# EXEC_REPORT: fix/prod-deploy-git-hardening

## Резюме

Выполнен минимальный патч pipeline деплоя ProcessMap для устранения split-brain деплоя и унификации BUILD_ID.

## Что изменено

| Файл | Изменение |
|------|-----------|
| `docker-compose.prod.yml` | `env_file: !override` на `/opt/processmap/env/prod.env` для `api`, `celery-worker`, `agent`, `notifications` |
| `.github/workflows/deploy-prod.yml` | Единый BUILD_ID только в `/opt/processmap/env/prod.env`; guard `COMPOSE_PROJECT_NAME=app`; полный набор сервисов; `PREVIOUS_BUILD_ID`; post-deploy verify + auto-rollback |
| `deploy/deploy.sh` | Убрана запись в `.env`; guard против prod-запуска без `--prod-local`; включён `celery-worker` |
| `.github/workflows/rollback-prod.yml` | Откат всех сервисов + восстановление BUILD_ID; `workflow_call` |
| `.github/workflows/deploy-stage.yml` | Изоляция stage в `/opt/processmap-stage/app` через git worktree |
| `.github/workflows/prod-deploy-verify.yml` | Проверка SHA всех сервисов, unregistered task; `workflow_call` |
| `verify-deploy.sh` | Функции guard'ов и проверки консистентности SHA |
| `scripts/tests/test_verify_deploy.sh` | Тесты guard'ов и единого списка сервисов |
| `RUNBOOK.md` | Процедура «Падение прода», запрет ручного `deploy.sh` |

## Валидация

- `bash scripts/tests/test_verify_deploy.sh` — 14 passed, 0 failed.
- `python3 yaml.safe_load()` для всех `.github/workflows/*.yml` — OK.
- `bash -n` для `deploy/deploy.sh`, `verify-deploy.sh`, `scripts/tests/test_verify_deploy.sh` — OK.

## Git state

- branch: `fix/prod-deploy-git-hardening`
- HEAD: `00cfa876...`
- origin/main: `ffaaa38f...`
- PR: https://github.com/xiaomibelov/processmap_v1/pull/854
- Status: clean (no uncommitted changes)

## Ограничения / риски

- `docker compose` на сервере должен поддерживать `!override` для `env_file` (уже используется для `ports`).
- Stage worktree bootstrap выполнится при первом деплое после merge.
- На прод-сервере ничего не выполнялось; деплой только после явного approve.

## Obsidian mirror

Mirror через `tools/pm-agent-mirror-report.sh` не выполнен: canonical paths `/opt/processmap-test` и `/srv/obsidian/project-atlas` недоступны в текущей macOS-среде. Артефакты контура сохранены в worktree и в git (`.planning/contours/fix/prod-deploy-git-hardening/`).

## Следующие шаги

1. Code review.
2. После approve — merge пользователем.
3. Деплой stage → prod по pipeline вручную после отдельного approve.
4. Ликвидация drift'а ops-процедурой (см. PR description).
