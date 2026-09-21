# EXEC_REPORT — S4 (F3: companion element.updateDi в mapConnectionReconnect)

Контур: `fix/canvas-move-di-desync-409-tracker`. Срез S4. TDD RED→GREEN.
Дата: 2026-09-21. Baseline: `origin/main @ 90556bae` + S1–S3
(`abd2546b`, `24ece1c8`, `f77fa4b2`).

## Что сделано

`commandToOps.js` `mapConnectionReconnect` (commandToOps.js:355-388):

- companion `element.updateDi` с waypoints из снапшотного ref соединения
  (post-action; на undo-changed — post-undo captured, parity elements.move,
  S7-контракт). Порядок батча: `connection.reconnect` → `element.updateDi`.
- Waypoints отсутствуют в снапшоте → reconnect без updateDi (текущее
  поведение, by design — аплайер сам отрендерит маршрут при следующей записи).
- Fail-closed: `strictIdOf` на id связи (не-строковый id → needsFullSave, не
  `"[object Object]"`); waypoints заявлены, но битые → needsFullSave
  (молчаливая потеря запрещена).
- Возврат переведён с `{op}` на `{ops}` (паритет S1-мапперов; outbox с S1
  принимает весь батч).

Backend не тронут: `_apply_connection_reconnect` намеренно не мигрирует
DI-edge (API.md §5.4) — companion-op закрывает разрыв на wire-уровне, новых
op-типов нет (`element.updateDi` существует с step1/C3).

## Тесты

RED подтверждён (3 новых падали; тест «без waypoints → reconnect only»
зелёный на main — by-design характеризация):

- companion op + порядок батча;
- undo: compensating reconnect(oldSource/oldTarget) + updateDi с captured
  post-undo waypoints как есть;
- fail-closed: не-строковый id связи, битые waypoints.

GREEN: `commandToOps.test.mjs` 84/84, opsOutbox (9 файлов) 173/173, полный
`npm test` — фейл-сет идентичен baseline (см. git-proof коммита; hang
`saveBpmnState.property-pipeline` как обычно).

## E2E (локальный стек ветки, build `s4-local`, реальная мышь)

Скрипт: `e2e/s4-reconnect-di.mjs`; лог `e2e/logs/s4-e2e-reconnect-di.jsonl`;
xml/shots в `e2e/xml|shots`. Fixture: Start → Task_A →(F_2)→ Task_B → End +
свободная Task_C. Reconnect конца F_2 на левую грань Task_C драгом мышью.

Результат (VERDICT pass=true):

| Проверка | Значение |
|---|---|
| Payload POST /operations | `["connection.reconnect", "element.updateDi"]` (reconnect=1, updateDi=1) |
| Server truth ДО restore | F_2: Task_A → **Task_C**, endWp (540,400) — на левой грани Task_C (bounds x540, y360..440), startDocked/endDocked true |
| После reload | идентично — маршрут у новых endpoints персистентен |
| PUT /bpmn (putCount) | 0 — ops-only, full-save fallback не участвовал |

## Метрика 1+1+X

Без изменений: backend-diff 0, новых op-типов/путей/флагов нет; дифф —
одна функция + 4 теста.

## Файлы

- `frontend/src/features/process/bpmn/save/opsOutbox/commandToOps.js`
  (mapConnectionReconnect);
- `frontend/src/features/process/bpmn/save/opsOutbox/commandToOps.test.mjs`
  (S4-блок: 4 теста);
- `e2e/s4-reconnect-di.mjs` + evidence (logs/xml/shots).
