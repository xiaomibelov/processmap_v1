# PR — S1 (fix/canvas-move-di-desync-409-tracker)

**Срез:** S1 — F1/F2: enrichment affectedConnections для shape.move / shape.resize.
**Ветка:** `fix/canvas-move-di-desync-409-tracker` (baseline `origin/main @ 90556bae`).
**Статус:** готово к review. PUSH в origin НЕ выполнялся (делает оркестратор).

## Проблема (из аудита canvas-move-di-desync-422)

Одиночный drag/resize на канвасе обновляет DI инцидентных стрелок только на
клиенте; серверный DI устаревает → растянутые стрелки после reload
(evidence: f1b case1 — F_1.end/F_2.start отстыкованы в server truth).

## Root cause (уточнён live-probe'ом)

Два независимых дефекта:

1. **Outbox обрезал батч** (latent с C3-S3): `pushCommand` брал только
   `mapped.ops[0]`. Батч-мапперы (`elements.move`, `spaceTool` — и добавленные
   S1 `shape.move`/`shape.resize`) возвращают `shape op + element.updateDi[]`,
   но на сервер уходила только первая op. Runtime-enrichment работал
   (дескриптор несёт affectedConnections), updateDi терялся в outbox.
2. **Enrichment не покрывал одиночные команды**: веток `shape.move` /
   `shape.resize` в `enrichPositionalSnapshot` не было (только
   `elements.move`/`spaceTool`).

## Изменения

1. `runtime/positionalSnapshot.js` (новый модуль): чистый перенос чистых
   snapshot-хелперов из `createBpmnRuntime.js` + ветки `shape.move` /
   `shape.resize` → `collectIncidentConnections([context.shape])`.
2. `commandToOps.js`: `mapShapeMove`/`mapShapeResize` — updateDi-батч после
   shape op (порядок, undo-паритет по captured waypoints, fail-closed);
   `strictIdOf` ужесточён до непустой строки (object-id → needsFullSave).
3. `createSaveOutbox.js`: `pushCommand` принимает ВЕСЬ батч — execute пушит
   все op (coalesce по key, порядок), undo удаляет/компенсирует каждую op
   батча. Одиночные мапперы — прежнее поведение.
4. `docker-compose.yml`: kanboard-порт параметризован `${KANBOARD_PORT:-3001}`
   (параллельные локальные стеки; дефолт не изменён).

Backend не тронут. Новых op-типов, PUT-путей, флагов, fallback'ов нет —
**метрика 1+1+X без изменений** (доказательство grep'ом по diff: 0 новых
HTTP-вызовов, backend-diff пуст).

## Тесты (TDD, RED подтверждён каждый шаг)

- unit маппер (6 новых): батч/порядок/undo/fail-closed — green;
- unit enrichment (6 новых): affectedConnections непустой, waypoints
  актуальные, post-undo parity, битый контекст не ломает, дедупликация,
  регрессия elements.move/spaceTool — green;
- unit outbox (3 новых): батч целиком в flush, undo не-ушедшего батча,
  компенсирующий батч после flush — green;
- регресс: opsOutbox 164/164, vitest smoke 68/68, полный `npm test` —
  множество фейлов идентично baseline (26 pre-existing, дифф пуст);
- e2e (локальный стек ветки, реальная мышь):
  (a) single drag → payload `[shape.move, updateDi, updateDi]`, server truth
  docked ДО restore (putCount=0), после reload docked — **PASS**;
  (b) resize-down → payload `[shape.resize, updateDi, updateDi]`, docked —
  **PASS**.

## Риски

- R1 (PLAN): updateDi пишет absolute waypoints для auto-layout-якорей —
  семантика совпадает с battle-tested elements.move (S3).
- Outbox-батч меняет поведение multi-drag/spaceTool (теперь updateDi реально
  долетает) — это исправление, а не регрессия; регресс-набор подтверждает.

## Откат

Revert одного коммита S1. Поведение отката = текущее main (с latent-обрезкой
батча — известный дефект, фиксится только этим срезом).

## Следующие срезы

S2 (F5 ops-ack adopt + WHY_NO_CROSS_TAB_HEAL.md) → S3 (модал 409) → S4 (F3
reconnect companion updateDi). Deploy/merge — только по approve владельца.
