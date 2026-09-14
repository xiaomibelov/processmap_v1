# PR (черновик) — feature/async-save-pipeline-step1

> Заполняется перед открытием PR. Не открывать без approve пользователя.

## Заголовок

`feat(save): инкрементальное сохранение диаграммы — POST /sessions/{id}/operations + SaveOutbox (step 1)`

## Что / Зачем

Save-pipeline был синхронным: полный BPMN XML (~745 kB на схемах 300+ элементов) сериализовался и отправлялся на каждый flush, UI ждал ответа (~2 s, под нагрузкой до 9–10 s). Это последний блокирующий участок на больших сессиях.

Step 1 переводит типовое редактирование на инкрементальные дельты:

- **Новый endpoint** `POST /api/sessions/{id}/operations`: батч операций `{baseVersion, operations:[{opId,type,...}]}`; CAS по `diagram_state_version`; атомарное применение к хранимому XML в одной транзакции; инкремент версии на батч; идемпотентность по `opId` (таблица `session_applied_ops`); 409 с `currentVersion`+`currentXml`.
- **Фронт SaveOutbox**: четвёртый pipeline в существующем `saveCoordinator` (debounce 2.5 s / порог 50 ops / flush на hidden+beforeunload через fetch keepalive), optimistic-индикатор в существующем save-status slot, автоматический rebase при 409 через replay на актуальном XML.
- **Full-save не удалён и не изменён**: fallback для команд вне op-whitelist и для деградации дельта-протокола.

## Формат дельт

Bounded op-vocabulary, производный от commandStack (`element.updateProperties`, `shape.move/resize/create/delete`, `connection.create/delete`, `element.updateDi`) — не сырой commandStack dump (несериализуем), не JSON Patch (нет канонической JSON-модели на сервере; XML — source of truth для subprocess re-embed, snapshots, derivatives). Обоснование: `.planning/contours/feature/async-save-pipeline-step1/PLAN.md` §3.

## Как проверено

- Backend pytest: happy path, 409, идемпотентность (повтор = тот же version, applied:0), транзакционность (невалидная op откатывает батч), CAS race, Redis lock 423, golden parity applier vs клиентский путь на XML 300+ элементов.
- Frontend node:test: outbox debounce/порог/flush, keepalive-заголовки, rebase (same opId), degrade.
- E2E (`e2e/async-save-operations.spec.mjs`): 300+ элементов, 20 правок — только `/operations` ≤10 kB, p95 <300 ms, нет longtask >200 ms, после reload все правки на месте; под-сценарии 409-rebase и fallback.
- Регрессии: save-e2e контракты (canvas-editing-stability и др.) зелёные; `update_openapi.sh` 0 errors.
- Метрики: см. TESTS.md §6 / EXEC_REPORT.md.

## Риски / ограничения

- XML re-serialize на сервере: семантика сохраняется, byte-формат может отличаться — закрыто golden-parity тестами.
- Undo/redo-native rebase — исследование, primary-механизм replay через существующий applyOps.
- `ops-degraded` режим до reload страницы при повторных сбоях — осознанный UX-компромисс.
- Не breaking: существующие эндпоинты не менялись.

## Чеклист

- [ ] `docs/openapi.yaml` регенерирован (`./scripts/update_openapi.sh`, 0 errors)
- [ ] contract-suite зелёная
- [ ] contour artifacts: PLAN/API/UI/TESTS/EXEC_REPORT/REVIEW_REPORT
- [ ] e2e метрики из TESTS.md §6 записаны
