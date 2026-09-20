# PR — S4: artifact-типы волнами (textAnnotation/association → data-refs → lane)

> Контур: `feature/mutation-gateway-c3`, срез S4 (PLAN.md §7/§8). Base: S3 (`bfa718c6`, VERIFIED).
> Merge/PR — только по explicit approve владельца.

## Что (волны, каждая — работоспособный коммит с e2e-гейтом)

- **Волна 1** (`340274f0`): **textAnnotation + association** в ops. Golden-parity с реальным full-PUT bpmn-js: текст аннотации — дочерний `<bpmn:text>` (не name-атрибут), updateLabel аннотации → `updateProperties{text}` + `shape.resize` (bounds под текст); association — атрибуты sourceRef/targetRef **без** incoming/outgoing на endpoints (artifactRef не терять, #995); каскад delete annotation→association через sourceRef/targetRef-scan.
- **Волна 2** (`001a0410`): **dataStoreReference / dataObjectReference**. dataObjectReference create — companion `<bpmn:dataObject>` в process (golden: клиент минтит dataObjectRef, бэкенд повторяет); delete — каскадная чистка companion (golden: bpmn-js удаляет сироту при save).
- **Волна 3** (`42c67330`): **lane** (flowNodeRef). create — `<bpmn:lane>` в `<bpmn:laneSet>` process'а (laneSet минтится при отсутствии; parent=participant резолвится через processRef; DI `isHorizontal="true"` — golden). **Fail-closed**: delete lane с flowNodeRef-children → typed 422 `lane_not_empty` → честный degrade в full-save.
- **participant/pool — НЕ тронут: cold навсегда** (`needsFullSave` обеих сторон). Обоснование: create participant — трансформирующая операция (collaboration + processRef мятеж к process, см. golden probe: весь документ перестраивается), объём и риск round-trip (прецедент #995) не оправданы для интерактивного канала; participant создаётся редко и сознательно — cold-путь с full-PUT корректен и fail-closed. Решение согласовано PLAN §8 («participant — cold по умолчанию»).

Снятие типов из `_UNSAFE_FULL_SAVE_ONLY_BPMN_TYPES` и `FULL_SAVE_REQUIRED_BPMN_TYPE_PATTERN` — **строго парами (frontend+backend) в коммите волны**, после golden/parity тестов (11 новых backend + 3 блока frontend).

## Fail-closed (урок E3)

- Неизвестный artifactRef (association к несуществующему) → typed 422 `source_not_found`/`target_not_found`.
- Неполный artifact-контекст на фронте → `needsFullSave` (strictIdOf-паттерн S3; reparent/attach для elements.move).
- populated lane delete → typed 422 `lane_not_empty` (не молчаливое повреждение).
- undo text-edit аннотации → `needsFullSave` (oldBounds не в снапшоте — причина зафиксирована, без молчаливого промежуточного состояния).

## e2e-гейты (локальный стек ветки; контейнерный фронт с кодом среза)

| Волна | create | move | delete | reload server truth |
|---|---|---|---|---|
| 1 textAnnotation/association | 0 PUT / 1 ops | 0 PUT / 1 ops (real drag) | 0 PUT / 1 ops | текст+assoc+DI ✓; каскад ✓ |
| 2 data-refs | 0 PUT / 1 ops | 0 PUT / 1 ops (real drag) | 0 PUT / 1 ops | companion ✓; каскад ✓ |
| 3 lane (pool-fixture) | 0 PUT / 1 ops | 0 PUT / 1 ops | 0 PUT / 1 ops | laneSet+isHorizontal+DI ✓; Lane_0 ✓ |

`evidence/s4/logs/` (dev-итерации с зафиксированными находками + контейнерные финалы). Находки: restart api обязателен после backend-правок (uvicorn держит код в памяти — поймано 422 на свежих типах).

## Undo-семантика (явная)

create artifact → compensating delete-op parity (каскады готовы); move → -delta parity (S3); **text-edit annotation undo → needsFullSave** (oldBounds не в снапшоте); delete artifact undo → needsFullSave (S7); populated lane delete → typed 422.

## Метрика «пути записи до/после» (18 → 1+1) — честное состояние после S4

**18 → 14**: textAnnotation, association, dataStoreReference, dataObjectReference, lane выведены из full-путей в ops (интерактивные create/move/delete этих типов больше не порождают PUT /bpmn — подтверждено e2e counters каждой волны). Остаются full-пути: participant (cold навсегда), dataInput/OutputAssociation, property panel (S5), ops-degrade (S6), undo-of-delete (S7), системные cold-действия (§9, перманентны).

## Дата смерти

**`fpc_gateway_cold_fallback` = 2026-10-03** (последний день; после даты флаг и fallback-ветки удаляются либо эскалация владельцу). Kill-switch `fpc_gateway_lane` (S1) без изменений.

## Тест-матрица

| Слой | Результат |
|---|---|
| backend ops/parity (+11 golden/fail-closed) | 56 passed + 3 subtests |
| frontend save-зоны | 548/549 (1 pre-existing hang) |
| полный frontend-сьют | 3997 тестов, **0 новых падений** vs S3-baseline (73 pre-existing; presence-флап семейство колеблется между прогонами — load-flaky, вне save-скоупа) |
| e2e волн 1-3 | PASS (контейнер) |

## Rollback

1. Revert коммитов волн в обратном порядке (`42c67330` → `001a0410` → `340274f0`).
2. Оперативно: `localStorage.fpc_gateway_lane="0"` (S1 kill-switch).

## Риски

- companion dataObject — server-minted id (клиентский id из командного контекста в снапшот не попадает; dataObject сам по себе в ops не адресуется) — зафиксировано как ограничение.
- undo text-edit аннотации до S7 — needsFullSave (честный fallback).
- participant cold: палитра pool продолжает давать full-PUT (by design).
