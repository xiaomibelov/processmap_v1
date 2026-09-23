# EXEC REPORT — fix/canvas-telemetry-vitrina-empty

- **Role:** Agent 2 (Executor)
- **Branch:** `fix/canvas-telemetry-vitrina-empty` от `origin/main` = `91114a19` (contour-start = stage `/version`, подтверждён: served `91114a1954b…`)
- **Worktree:** `/Users/mac/agents_place/kimi_PM/.wt-canvas-telemetry-vitrina-empty`

## RC (зафиксирован в DIAGNOSIS.md, доказан 5 плоскостями)

**celery-beat отсутствует в stage-контуре.** `docker-compose.stage.yml` не описывал сервис, CI `deploy-stage.yml` не включал его в `UP_SERVICES`/`BUILD_SERVICES` (git history `-S UP_SERVICES`), freshness-гейт проверял только UP_SERVICES. Контейнера beat на хосте нет (ни running, ни exited), альтернативных планировщиков нет → `processmap.canvas_telemetry.aggregate_task` (crontab */5) не запускался с 2026-09-22 21:56 UTC → витрина `canvas_event_read` не пополнялась.

Отвергнуто: B (worker ≠ БД — DSN идентичен), C (0 ошибок, таск не доходит), D (raw на месте, watermark догонит), E (таск зарегистрирован в worker).

## Изменения (минимальный патч)

1. `docker-compose.stage.yml` — override `celery-beat` (`image: processmap_stage-celery-beat:${STAGE_IMAGE_TAG:-local}`, `env_file: .env.stage`), симметричен celery-worker.
2. `.github/workflows/deploy-stage.yml` — `celery-beat` добавлен в `BUILD_SERVICES` и `UP_SERVICES` (попадает в build и freshness-гейт автоматически).
3. `backend/tests/test_canvas_telemetry_beat_schedule.py` (новый, регрессия инцидента):
   - beat_schedule содержит `canvas-telemetry-aggregate` и `canvas-telemetry-cleanup`;
   - stage-compose описывает celery-beat с версионируемым image;
   - deploy-stage.yml управляет celery-beat.

Продуктовый код backend/frontend не менялся — агрегатор и классификатор исправны, дыра была в инфраструктуре планирования.

## Доказательства

- RED: `test_stage_compose_defines_celery_beat` + `test_deploy_stage_workflow_builds_and_starts_celery_beat` падали до фикса с корректными причинами (2 failed, 2 passed).
- GREEN: `pytest tests/test_canvas_telemetry_aggregator.py tests/test_canvas_telemetry_ingest.py tests/test_canvas_telemetry_beat_schedule.py -q` → **38 passed** (venv py3.11, оригинальные pins).
- Compose-merge: `docker compose -f docker-compose.yml -f docker-compose.stage.yml config` → `celery-beat` получает `image: processmap_stage-celery-beat:91114a19`, exit 0.

## Риски / ограничения

- Живая приёмка на stage (repro cold first entry → группа ops_409 в /admin/canvas-telemetry с classification ≤ одного цикла aggregate) возможна только после merge + auto-deploy в stage — **требует approve пользователя**. До неё контур не закрывается.
- `deploy-stage-ref.yml` (ручной деплой по ref) пересоздаёт только api/frontend — beat после первого CI-деплоя живёт за счёт `restart: unless-stopped`; полный контур stage по-прежнему обеспечивает только deploy-stage.yml.
- После восстановления beat агрегатор идемпотентно догонит все 10 pending-сессий (raw-события 2026-09-22 21:06 UTC — 2026-09-23 18:05 UTC), включая `2ce96a6631`.
- Замечание к инциденту: в задании «3× ops_409», в БД сессии — 1 событие kind='error' (409) + успешный retry; на RC не влияет.

## Git proof

```
branch: fix/canvas-telemetry-vitrina-empty (от origin/main 91114a19)
diffstat: docker-compose.stage.yml (+11), .github/workflows/deploy-stage.yml (+6/-2),
          backend/tests/test_canvas_telemetry_beat_schedule.py (+96, новый),
          .planning/contours/fix/canvas-telemetry-vitrina-empty/ (PLAN/DIAGNOSIS/EXEC/STATE)
```
