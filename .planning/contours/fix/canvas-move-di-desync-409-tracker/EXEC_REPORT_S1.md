# EXEC_REPORT — S1 (F1/F2: enrichment affectedConnections для shape.move / shape.resize)

Контур: `fix/canvas-move-di-desync-409-tracker`. Срез S1, TDD RED→GREEN.
Baseline: `origin/main @ 90556bae`. Дата: 2026-09-21.

## Что сделано

1. **Enrichment (снапшот-слой)**: `enrichPositionalSnapshot` дополнен ветками
   `shape.move` / `shape.resize` → `collectIncidentConnections([context.shape])`
   → дескрипторы `affectedConnections` с актуальными waypoints (паритет
   `elements.move`/`spaceTool`, S3). Хелперы вынесены из closure
   `createBpmnRuntime.js` в модуль `runtime/positionalSnapshot.js` — чистый
   перенос (байт-в-байт), ради прямой unit-тестируемости. Runtime теперь
   импортирует их (`createBpmnRuntime.js:7-12`).

2. **Мапперы**: `mapShapeMove` / `mapShapeResize` принимают updateDi-батч из
   `affectedConnections` (порядок: shape op → updateDi batch), оба переведены
   на `strictIdOf` — ужесточён до «только непустая строка»
   (commandToOps.js:504-509): не-строковый id больше не сериализуется в
   `"[object Object]"`, а fail-closed в `needsFullSave`. Undo-паритет (S7):
   `shape.move` — negated delta, `shape.resize` — oldBounds, updateDi берёт
   captured post-undo waypoints как есть.

3. **Outbox (LATENT C3 BUG, найден e2e-прогоном)**: `pushCommand` брал только
   `mapped.ops[0]` — хвост батча (`element.updateDi` для инцидентных стрелок)
   молча терялся ДЛЯ ВСЕХ батч-мапперов, включая `elements.move`/`spaceTool`
   с C3-S3. F1-прогон (a) показал: runtime-дескриптор несёт
   `affectedConnections [F_1, F_2]`, а в POST /operations уходит только
   `shape.move`. Исправлено: execute пушит ВЕСЬ батч в буфер (coalesce по key
   якоря, порядок сохранён); undo удаляет/компенсирует КАЖДУЮ op батча
   (правило MAJOR-1 про `__coalesceCount > 1` сохранено). Одиночные мапперы —
   байт-в-байт прежнее поведение (батч длины 1).

## Root cause (итоговая формулировка F1/F2)

Аудит фиксировал: «одиночный drag фаерит shape.move без enrichment». Live-probe
показал точнее: одиночный drag фаерит `elements.move` (closure.allConnections
обогащается снапшот корректно), но outbox с C3-S3 обрезал батч до ops[0] —
updateDi не долетал. Для resize (F2) командой был `shape.resize` — enrichment
ветки не существовало, и обрезка outbox'а тоже применялась. Два независимых
дефекта, оба закрыты.

## Тесты

- RED подтверждён:
  - маппер: 5 новых тестов падали (`commandToOps.test.mjs`, S1-блок);
  - enrichment: 3 новых теста падали (`positionalSnapshot.test.mjs`);
  - outbox: 2 новых теста падали (`createSaveOutbox.test.mjs`, S1-блок).
- GREEN:
  - `commandToOps.test.mjs` + `positionalSnapshot.test.mjs`: 86/86;
  - `opsOutbox` (все 9 файлов): 164/164;
  - vitest smoke (save-зоны): 68/68;
  - полный `npm test`: см. раздел «Регресс».
- Регресс (T7): полный прогон `npm test` на ветке vs baseline-worktree
  (`origin/main @ 90556bae`): множества падающих тестов ИДЕНТИЧНЫ
  (26 уникальных, дифф пуст) — pre-existing (appVersion drift v1.0.141,
  i18n, dark-theme C1, presence flaky, Admin-topbar), оба прогона обрезаны
  известным hang'ом `saveBpmnState.property-pipeline` (не мой, не чинил).

## E2E (S0-методика, локальный стек ветки)

Стек: `docker compose` из worktree `.wt-canvas-move-di-desync-409-tracker`,
образы собраны из ветки (`/version` → branch `fix/canvas-move-di-desync-409-tracker`,
build `s1-local-2`; bundle содержит S1-код). Порты 35177/38011/35432/36379/
23001/58008 (стандартные заняты соседними стеками). Креды — env-импорт из
`.env` worktree, в логи не попали.

Скрипт: `e2e/s1-di-docking.mjs`, лог `e2e/logs/s1-e2e-di-docking.jsonl`,
xml/shots в `e2e/xml|shots`.

| Кейс | Payload POST /operations | dockedBeforeRestore | dockedAfterReload | Итог |
|---|---|---|---|---|
| (a) single drag Task_A (реальная мышь, +160/+120) | `["shape.move","element.updateDi","element.updateDi"]`, updateDiCount=2, putCount=0 | true | true | PASS |
| (b) resize-down Task_A (реальная мышь по `.djs-resizer-s`, −30 высота) | `["shape.resize","element.updateDi","element.updateDi"]`, updateDiCount=2, putCount=0 | true | true | PASS |

`putCount=0` — DI починен ops-only путём, full-PUT fallback не участвовал.
Докинг = крайние waypoints внутри границ шейпов-владельцев (±8px).

## Метрика путей 1+1+X (T8)

Доказательство diff'ом (`git diff origin/main`):
- backend: 0 строк изменено (апплаеры `updateDi`/`shape.move`/`shape.resize`
  не тронуты — C3-контракт соблюдён);
- новых op-типов нет (`element.updateDi`, `shape.move`, `shape.resize`
  существуют с C3/step1); новых PUT-путей/флагов/fallback'ов нет — grep по
  добавленным строкам на `app.(put|patch|post)`/`/api/` — пусто;
- изменения только во frontend-снапшот-слое, мапперах и outbox-буфере.

X=3 как было: 1 (PUT /sessions/{id}/bpmn) + 1 (PATCH /sessions/{id}) + 3
(PUT bpmn-xml, POST operations, meta/hybrid) — без изменений.

## Файлы

- `frontend/src/features/process/bpmn/runtime/positionalSnapshot.js` (новый,
  перенос + S1-ветки + тест `positionalSnapshot.test.mjs`);
- `frontend/src/features/process/bpmn/runtime/createBpmnRuntime.js` (импорт,
  локальные копии удалены);
- `frontend/src/features/process/bpmn/save/opsOutbox/commandToOps.js`
  (mapShapeMove/mapShapeResize батч + strictIdOf);
- `frontend/src/features/process/bpmn/save/opsOutbox/createSaveOutbox.js`
  (pushCommand: полный батч execute/undo);
- тесты: `commandToOps.test.mjs` (S1-блок), `createSaveOutbox.test.mjs`
  (S1-блок);
- `docker-compose.yml`: kanboard-порт параметризован
  (`${KANBOARD_PORT:-3001}`) — иначе параллельные стеки не поднять; дефолт
  сохранён.

## Ограничения / не сделано (вне S1)

- S2 (F5 ops-ack adopt), S3 (модал 409), S4 (F3 reconnect) — по PLAN.
- Soak-батарея с новыми сценариями (`di-docking-after-mutations`) —
  после stage-деплоя (release-контур по approve).
