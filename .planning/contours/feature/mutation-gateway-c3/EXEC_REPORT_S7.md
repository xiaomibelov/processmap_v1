# EXEC_REPORT — S7 (undo/redo полнота) контура feature/mutation-gateway-c3

Дата: 2026-09-20. Роль: Agent 2 (Executor). Срез: S7 по PLAN.md §7.
Статус: **DONE** (push после среза; PR не создавался).

## Матрица undo/redo × 8 мапперов (e2e, изолированный стек wt-mgc3-s7)

Каждая строка: do → undo → redo; каждая фаза **0 PUT /bpmn + ≥1 POST /operations**; финальный reload → server truth (API XML). Логи: `evidence/s7/logs/s7-e2e-undo-matrix.jsonl`.

| Маппер | do | undo | redo | server truth | Вердикт |
|---|---|---|---|---|---|
| move (elements.move single) | 0 PUT/ops ✓ | ✓ | ✓ | DI-смещение ±3px ✓ | PASS |
| resize | ✓ | ✓ | ✓ | width+40 ✓ | PASS |
| create | ✓ | ✓ | ✓ | элемент в XML ✓ | PASS |
| delete + **golden recreate** | ✓ | ✓ (compensating create, **тот же id**) | ✓ | после undo — на месте с id; после redo — gone (API-truth) ✓ | PASS |
| reconnect | ✓ | ✓ | ✓ | Flow_2 sourceRef=Task_1 ✓ | PASS |
| label (updateLabel) | ✓ | ✓ | ✓ | name ✓ | PASS |
| spaceTool | ✓ | ✓ | ✓ | Task_2 сдвинут > +60px ✓ | PASS |
| elements.move (multi) | ✓ | ✓ | ✓ | Task_2 +32px ±3 ✓ | PASS |

**Вся матрица PASS.** Golden-parity undo-delete: компенсирующий create-op воссоздаёт элемент с исходным id; серверный XML после ops-undo === ожидаемое состояние full-PUT undo (element + DI на месте).

## Ключевые находки GREEN-итераций

1. **undo delete фаерит `id.updateClaim`** (верхнее событие — пустой дескриптор claim-сервиса; recreate молчаливо внутри handler.revert). Решение: runtime-enrichment доснимает post-undo live-ref из elementRegistry (полный recreate-пayload); **redo** id.updateClaim → delete-op. SnapshotElementRef расширен: +parentId, +endpoints (sourceId/targetId), +text для textAnnotation.
2. **undo spaceTool / text-edit аннотации**: oldBounds/oldWaypoints в контексте отсутствуют, но на undo-changed live-refs уже несут ВОССТАНОВЛЕННЫЕ bounds/waypoints — inverse строится по ним (-delta move + absolute resize + updateDi). Fail-closed: bounds отсутствуют → needsFullSave (не молчаливый no-op).
3. **reconnect-контекст**: bpmn-js несёт `newSource/newTarget` (+`oldSource/oldTarget` в preExecute) — снапшот их не маппил (needsFullSave). Добавлено.
4. **:470 drift-pinpoint** — см. раздел ниже.

## Раздел: статус coverage-спеки :470 (pinpoint для S8)

**Причина дрейфа найдена и устранена в S7.** Спека `:470` пишет documentation через `modeling.updateProperties(el, {documentation: "строка"})` (2 правки из 20). S5-маппер `serializeDocumentationRows` принимал только массив moddle-rows → строка → needsFullSave → 18/20. **Не lane.updaterefs** (кандидат S6 опровергнут probe'ом: create/connect/delete в lane-фикстуре маппятся 4/4). Фикс: string → rows. Итоговый прогон спеки: **coverage 20/20=1.00, putBpmn=0, flushed ✓ — спека PASS** (ранее flaky-финиш стабилизирован). Для S8: пункт «ре-базелина :470» закрыт (спека зелёная на текущем словаре).

## Судьба X3 / X2

- **X3 undo-of-delete — СМЕРТЬ**: compensating create-op parity (e2e golden recreate ✓). Исключение закрыто.
- **X2 класс C (extensionElements) — cold с обновлённой причиной** (условие 3): round-trip ops требует порта preserve/rebuild-семантики camunda-extensions (managed properties/listeners rebuild + preserved-фрагменты, `camundaExtensions.js:1338-1402`) в серверный applier; риск #995 (round-trip артефактов) при текущем объёме не оправдан. Путь к ops: отдельная волна с golden-фикстурами полного extensionElements-цикла.

## Прогоны

| Слой | Результат |
|---|---|
| backend ops/parity/committed/conflict | 58 passed + 3 subtests |
| frontend save-зоны | 562/563 (hang pre-existing) |
| commandToOps юнит | 69/69 (9 новых S7 + 2 адаптированных S3/S4) |
| полный frontend-сьют | см. ниже (0 новых падений vs S6-baseline) |
| e2e: undo-матрица 8 мапперов | PASS |
| e2e: :470 coverage-спека | PASS (20/20, 0 PUT) |

## Метрика путей после S7: **1+1+X** (X=3)

X1 participant (cold навсегда), X2 класс C property (cold, причина обновлена — порт preserve/rebuild-семантики + golden-цикл, кандидат отдельной волны), X4 lane.updaterefs/data-ассоциации (needsFullSave, вокабуларая матрица §8). **X3 (undo-of-delete) закрыт.**

## Handoff / переносы

- S8: метрики приёмки (drag-замеры с обоими S0-baseline'ами: окно 572.3 мс / post-mouseup ~450 мс); :470 закрыта в S7; hang-тест tech-debt.
- Класс C ops-волна (вне S8): golden extensionElements-цикл.
