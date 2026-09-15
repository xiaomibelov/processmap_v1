# EXEC_REPORT — feature/async-save-pipeline-step1

> Дата: 2026-09-15. Ветка: `feature/async-save-pipeline-step1` (+9 к `origin/main` @ `b8285741`). Роль: Executor. Статус: implementation complete, e2e-acceptance GREEN, re-review после фиксов.

## Цель

Перевод сохранения диаграммы на инкрементальные дельты (POST /sessions/{id}/operations) без ломки существующего full save. Критерии приёмки — PLAN §9.

## Что реализовано

1. **Backend** (`c32a0da1` + доработки в `417c486f`): endpoint `POST /api/sessions/{id}/operations` — CAS по `baseVersion` (Redis lock → in-memory → SQL CAS), атомарный батч в одной транзакции (applied_ops + state_trace + session row), инкремент версии на батч, идемпотентность по `opId` (`session_applied_ops`, TTL 30 дней, celery daily 05:10 + lazy ~1/200), whitelist-applier к ElementTree (8 op-типов), 409 с `server_current_version` + `server_current_xml`, 422 с откатом батча, wire-алиасы клиентского формата, duplicate opId → 422, запись `id` через updateProperties заблокирована.
2. **Frontend** (`1ed61a70`, `be01ee09`, `b00a8a4f`, `417c486f`): SaveOutbox (commandToOps/serializer/outbox/rebase/config) как pipeline `"ops"` через публичный API saveCoordinator; wiring в живое дерево (5 hook points, additive); dedup автосейва (shouldSkipFullSave); keepalive-flush с Authorization; coverage-recorder `__PM_OPS_COVERAGE__`; echo suppression `__pmOpSource:"replay"`; rebase по реальному полю `server_current_xml` с degrade без XML; ack-wipe защита (inFlightSentCount); undo слитой op → needsFullSave.
3. **Документы**: `docs/openapi.yaml` (`18c18dcd`, +1 operation, redocly 0 errors).

## Доказательства

### E2E-принятие (финальный прогон, 3 подряд зелёных runs 11/12/13)

Спек: `frontend/e2e/async-save-operations.spec.mjs` (3 теста), host chromium, 1 worker, стек `processmap_v1` нацелен на ветку (proof: 404 SESSION_NOT_FOUND на живом роуте).

| Метрика (TESTS.md §6) | Бюджет | Факт (run 12) | ✓ |
|---|---|---|---|
| Тело operations-запроса | ≤10 kB | **4042 B** | ✓ |
| PUT /bpmn за серию правок | 0 | **0** | ✓ |
| Ответ operations, p95 | <300 ms | **163 ms** (in-page Resource Timing) | ✓ |
| Longtask >200 ms в серии | 0 | **0** | ✓ |
| Coverage mapped/total | ≥0.95 | **20/20 = 1.00** | ✓ |
| 409-race: обе правки выживают, модала нет | обязательно | ✓ (оба маркера) | ✓ |
| spaceTool fallback: ровно 1 PUT, затем ops resume | обязательно | ✓ | ✓ |

### Юнит-прогоны (после фиксов, независимо перепроверено)

- Backend: `test_session_operations_api.py` (23, вкл. negative-paths 401/403/404) + `test_ops_applier_parity.py` (13) → **36 passed, 3 subtests**.
- Frontend: opsOutbox + staging + wiring + coordinator + hook подмножества → **233/233** (spot-check исполнителя: 71/71 на 4 ядровых файлах); полный `npm test` — 0 новых детерминированных падений vs baseline `origin/main` (79 pre-existing, failure set идентичен).
- Contract suite (schemathesis, до фиксов): **170 passed, 0 failed**.
- Backend save-регрессии: 22 passed / 1 pre-existing flaky (lock-timing, падает на чистом дереве).

### 5-plane proof

- **code**: `feature/async-save-pipeline-step1` @ `417c486f`, все срезы в коммитах (см. `git log origin/main..HEAD`).
- **workspace**: `p0-work-worktrees/feature-async-save-pipeline-step1`, clean после коммита (untracked только `docker-compose.async-save.yml` — артефакт прогонов).
- **DB**: e2e-подсценарии проверяли reload-персистентность (20/20 правок на месте, версия инкрементирована); идемпотентность/rollback покрыты api-тестами на temp SQLite.
- **env/compose**: стек `processmap_v1` repoint'ился на ветку для прогонов и **восстановлен** на `deploy-main-v1` (proof: `/operations` снова route-missing 404, frontend 200); env-lock released.
- **serving mode**: live-app обслуживает router-вариант `routers/sessions.py` → `session_service.operations_apply` → handler; тесты используют тот же `app.main:app`.

## Путь через review

`REVIEW_REPORT.md` (`6b819ef8`): вердикт CHANGES_REQUESTED → оба BLOCKER'а, MAJOR-1/3, NIT-3/4 исправлены в `417c486f` (детали — DEBUG-отчёт агента + регрессионные тесты). Открытые остатки:

- **NIT-1** (порядок parent re-embed vs API.md §3 — зеркалит существующий PUT /bpmn; API.md привести к факту или перенести re-embed — step2).
- **NIT-2** (dead keepalive-бюджет код — удалить или реализовать — step2).
- **Двойная регистрация роута** (`_legacy_main` + `routers/sessions.py`, живёт router-вариант) — удаление legacy-варианта при миграции роутов, step2.
- **Residual risk (pre-existing класс BLOCKER-2)**: manual full-save (не outbox-initiated) по ack всё ещё чистит весь ops-буфер — ops, добавленные во время ручного сохранения, могут быть потеряны; требует version-based reconciliation — материал step2. Outbox-initiated путь защищён (`fullSavePreserveFrom`).

## Риски/ограничения (принятые)

- XML re-serialize на сервере ET-based: семантика сохранена (canonical-compare golden-тесты, 3 реальных фикстуры + synthetic 300+ элементов), byte-формат отличается от bpmn-js saveXML — первый full-save после ops-пачек даст одноразовый XML-diff (version bump only).
- `connection.reconnect*` и прочее вне whitelist → full-save fallback (обоснование PLAN §3.1).
- Replay create-op → needsFullSave fallback (регенерация id сервером, step2).
- XML-стейт в store после 409-rebase может отставать до следующего снапшота (modeler authoritative).

## Осталось (вне execution)

- Повторное ревью (контроль BLOCKER'ов) → REVIEW_PASS.
- Перед PR: регенерация `docs/openapi.yaml` (описание операции), чек-лист PR.md.
- Merge/deploy — только после явного approve владельца.
