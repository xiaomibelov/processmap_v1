# DIAGNOSIS — fix/canvas-telemetry-vitrina-empty

Дата: 2026-09-23. Среда: stage (stage.processmap.ru, хост 31.192.110.145). Инцидент: audit/cold-entry-arrows-lost-after-f2, 20:22–20:24 МСК, сессия `2ce96a6631`.

## Симптом

`canvas_event_raw` жива (18 событий сессии, max ts = 2026-09-23 17:23:42 UTC), `canvas_event_read` не пополнялась с 2026-09-22 21:56:34 UTC (max `updated_at`). Группа ops_409 для сессии не появилась.

## RC (подтверждён, высокая уверенность)

**На stage отсутствует celery beat целиком → `processmap.canvas_telemetry.aggregate_task` (crontab */5, `backend/app/celery_app.py:30-35`) не запускается → витрина не строится.**

Доказательства (read-only, stage):

1. `docker ps -a | grep beat` — пусто: контейнера `celery-beat` нет (ни running, ни exited).
2. Альтернативных планировщиков нет: host crontab (только certbot/docker-cleanup), systemd — ни одного celery-юнита; worker запущен без `-B`; в api — только uvicorn.
3. Worker здоров и знает таск: стартовый листинг содержит `processmap.canvas_telemetry.aggregate_task`; за всю жизнь контейнера — 0 `received/succeeded/failed` по этому таску; 0 ERROR/Traceback за 24h.
4. Общая БД у api и worker: `DATABASE_URL=postgresql://REDACTED@postgres:5432/processmap_stage` (пароль редэктирован) — идентичен; sqlite-fallback нет.
5. Схема в порядке: колонка `classification` в `canvas_event_read` существует (guarded ALTER из `repository.py:95-99` не нужен, но сработал бы).
6. Источник дыры в коде:
   - `docker-compose.stage.yml` — сервиса `celery-beat` нет (есть override только для api/redis/postgres/frontend/celery-worker/notifications/agent/rag-embedder/stage-gateway);
   - `.github/workflows/deploy-stage.yml:351` — `UP_SERVICES="api frontend notifications celery-worker rag-embedder agent"`, beat туда **никогда** не входил (git history `-S UP_SERVICES`);
   - freshness-гейт (line 363) проверяет только UP_SERVICES → отсутствие beat CI не замечает;
   - `deploy/verify_celery_task.sh`-гейты проверяют только регистрацию в worker, не расписание.
   - Base `docker-compose.yml:82-99` (`celery-beat`) существует, `deploy/deploy.sh:90` поднимает beat — но stage деплоится только через CI, поэтому beat на stage не поднимается.

## Отвергнутые гипотезы

- **B (worker ≠ БД):** DATABASE_URL api/worker идентичен.
- **C (таск падает):** 0 ошибок в логах; таск не доходит до worker (нет `received`).
- **D (retention/фильтры):** все raw на месте; watermark-логика (`aggregate.py:178-200`) гарантированно выберет сессию при первом прогоне.
- **E (unregistered task):** таск в стартовом листинге воркера.

## Поведение при восстановлении beat

Агрегатор идемпотентен (`aggregate.py:7-8`): первый же прогон `aggregate_pending_sessions()` догонит все 10 pending-сессий, включая `2ce96a6631`. Для сессии: 1 событие kind='error' (409 DIAGRAM_STATE_CONFLICT, 17:22:40 UTC), после него ack 200 и save_status saved — классификация группы определится `_compute_classification` (`aggregate.py:89-97`) по реальным событиям.

## Замечание к заданию

В задании «3× ops_409 записаны»; в БД сессии `2ce96a6631` — **1** событие kind='error' (+ 3 'op', из них одна 409-попытка с успешным retry). На RC не влияет.

## Fix

Минимальный, на корень:
1. `docker-compose.stage.yml` — override `celery-beat` (image tag `processmap_stage-celery-beat:${STAGE_IMAGE_TAG}`, env_file `.env.stage`).
2. `.github/workflows/deploy-stage.yml` — `celery-beat` в BUILD_SERVICES и UP_SERVICES (автоматом попадёт в freshness-гейт).
3. Регрессионный pytest: beat_schedule содержит canvas-telemetry таски + stage-конфигурация содержит celery-beat (RED до фикса).
