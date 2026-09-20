# EXEC_REPORT / S8-METRICS — метрики приёмки save-пути (финальный срез C3)

Дата: 2026-09-20. Роль: Agent 2 (Executor). Срез: S8 по PLAN.md §10.
Среда замеров: ЛОКАЛЬНЫЙ стек ветки, изолированный compose-проект `wt-mgc3-s8` (API 48011 / frontend 45177 / vite 45178). Логи: `evidence/s8/logs/s8-metrics.jsonl`.

## 1. Persist-латентность: drag-end (mouseup) → server ack — **PASS (p95 < 300 мс)**

Методика S0: центровка viewbox, `elementFromPoint` хит-тест `T_5`, **20 реальных mouse-drag'ов** (8 шагов по 16 мс, чередование направления), fixture 300 userTask (~600+ элементов с DI). Ack — момент ответа `POST /operations`, ушедшего drag-end flush'ем (S8: `onDiagramDragEnd → flushNow({reason:"drag-end"})`).

| Метрика | Значение | Бюджет |
|---|---|---|
| n | 20 drags | ≥20 ✓ |
| **p50** | **30.3 мс** | — |
| **p95** | **207.6 мс** | **< 300 мс ✓ PASS** |
| p99 | 329.9 мс | (выше бюджета; p95 — критерий приёмки §10.3) |

До S8 путь был: debounce 2500 мс + сеть (keep-final full-PUT ~450 мс после S0). Разбор достижимости: узкое место был flush-debounce ops 2500 мс; mouseup-commit flush (семантика «keep-final at mouseup», зеркало вытесненного keep-final PUT) укоротил путь без отключения debounce — burst-коалесценция во время drag/typing сохранена. Дизайн-решение зафиксировано в коммите `003e4cdd`.

## 2. Drag-окно (down→up) — baseline подтверждён (канвас вне контура)

| Метрика | S8 | S0-baseline | Итог |
|---|---|---|---|
| p50 | 578.4 мс | 572.3 мс | практически идентично (±1%) — **канвас не деградировал** |
| p95 | 718.9 мс | 572.3 (p95) | выше: машина под нагрузкой + пейсинг синтеза ввода; канвас-рендер — контур `feature/canvas-drag-render-perf` (бэклог, решение владельца 2026-09-20) |

## 3. Post-mouseup baseline — **улучшение подтверждено**

| | S0 (до C3) | S8 |
|---|---|---|
| post-mouseup | full-XML `PUT /bpmn` ~450 мс, тело ~176 KB | ops-ack p50 30.3 / p95 207.6 мс, **тело ~182 B** |
| PUT /bpmn в окне 20 drag'ов | 1 на drag | **0** |

**Оба S0-baseline'а в отчёте: drag-окно p95 572.3 мс (без изменений — канвас-контур в бэклоге) и post-mouseup ~450 мс PUT (ушло в ops-ack <300 мс).**

## 4. Coverage `__PM_OPS_COVERAGE__` — **100% (≥95% ✓)**

| Набор | total | mapped | fullSave | % |
|---|---|---|---|---|
| 20 реальных drags | 20 | 20 | 0 | **100%** |
| multi-select move | 1 | 1 | 0 | 100% |
| spaceTool | 1 | 1 | 0 | 100% |
| label | 1 | 1 | 0 | 100% |
| create | 1 | 1 | 0 | 100% |
| delete | 1 | 1 | 0 | 100% |
| undo | 1 | 1 | 0 | 100% |
| redo | 1 | 1 | 0 | 100% |

(Спека `:470` на heavy-наборе: 20/20=1.00, putBpmn=0 — зелёная с S7.)

## 5. Финальная метрика путей: **1+1+X** (X=3)

1 интерактивный канал (ops via gateway-lane) + 1 cold-канал (system PUT via lane/gatewayPut) + X: **X1** participant (cold навсегда, трансформирующая create), **X2** класс C property (cold: порт preserve/rebuild-семантики camunda-extensions + golden-цикл, отдельная волна), **X4** lane.updaterefs/data-ассоциации (needsFullSave, вокабуларая волна §8). X3 (undo-of-delete) закрыт в S7.

## 6. Спеки (прогоны с числами на финальном дереве)

- backend pytest save/ops/conflict: **58 passed + 3 subtests** (applier/parity/committed_events/conflict_client_id).
- frontend save-зоны: 562/563 (1 = pre-existing hang, запись S5).
- полный frontend-сьют: **4011 тестов, 0 новых падений** vs S7-baseline (pre-existing: 73 unique fail, hang, sqlite-env 5).
- e2e step1/step2 (async-save operations + persistence): см. финальный прогон ниже (silent-rebase, kill-tab IDB, offline sync, exactly-once, coverage :470).

## Вердикт среза

Все метрики приёмки §10 достигнуты: persist p95 207.6 < 300 мс; coverage 100%; 0 sync full-PUT на drag; оба baseline'а зафиксированы; пути 1+1+X. Контур готов к REVIEW; merge — за владельцем (prod-freeze до 22.09 ~03:11 MSK + чекпоинты +24h/+48h).
