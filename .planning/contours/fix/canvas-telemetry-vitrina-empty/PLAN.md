# PLAN — fix/canvas-telemetry-vitrina-empty

- **Type:** fix (bounded contour)
- **Branch:** `fix/canvas-telemetry-vitrina-empty` от `origin/main` = `91114a19` (contour-start = stage `/version`)
- **Worktree:** `/Users/mac/agents_place/kimi_PM/.wt-canvas-telemetry-vitrina-empty`
- **Incident:** audit/cold-entry-arrows-lost-after-f2, stage, 2026-09-23 20:22–20:24 МСК, сессия `2ce96a6631`

## Симптом

Лента `canvas_event_raw` живая (3× ops_409 / DIAGRAM_STATE_CONFLICT записаны), но витрина `canvas_event_read` пуста: `/admin/canvas-telemetry` не показывает error-группы, classification недоступен. F1 (#1022) телеметрия пишется, но пользователь ошибку в витрине не видит.

## Гипотезы RC (кандидаты)

- **A.** `processmap.canvas_telemetry.aggregate_task` не запланирован/не запускается на stage (beat/worker).
- **B.** Celery worker читает не ту БД (api пишет raw в postgres, worker — sqlite fallback или другой DSN; см. `backend/app/domains/storage/compat/repository.py:517` — выбор backend по cfg).
- **C.** Таск падает с исключением (в `aggregate_pending_sessions` — SQL/compat; retry max_retries=1 и глотание логов).
- **D.** Retention/dedup/фильтры отрезают реальные строки.
- **E.** Таск не зарегистрирован в worker (unregistered task).

## Диагноз (RED, до кода)

1. Stage read-only: `/version`, `docker ps`, beat-логи (*/5 мин), worker-логи (aggregate_task received/succeeded/failed + traceback), сходимость DATABASE_URL api/worker/beat (редэктировано), прямые SELECT в `canvas_event_raw` / `canvas_event_read` (сессия `2ce96a6631`).
2. Локально: `_compute_classification` / `_is_confirmation_event` (`aggregate.py:70,89`) на реальных payload строк инцидента → ожидаемый classification (data_loss, т.к. после ошибок не было успешного ack/save_status).
3. Зафиксировать RC с file:line в `DIAGNOSIS.md`.

## Фикс

Минимальный, на корень RC. Backend pytest + регрессионный тест: batch raw (kind=error, ops_409) → `aggregate_pending_sessions()` → группа в `canvas_event_read` с classification=data_loss и контекстом.

## Приёмка (живая, stage)

Repro-флоу cold first entry: логин → «Открыть сессию» (НЕ deeplink) в сессию с dsv>0 → первый move элемента → ops_409. Error-группа `ops_409` появляется в `/admin/canvas-telemetry` с контекстом и classification в течение одного цикла aggregate (≤5 мин). **Требует approve на merge/deploy в stage.**

## Запреты контура

No merge/deploy/PR без явного approve; без секретов в выводе/коммитах; без изменений вне backend-агрегатора и его тестов.
