# PR — feature/mutation-gateway-c3: mutation gateway для save-пути (C3, финальное описание)

> Ветка: `feature/mutation-gateway-c3` (от `2c051887` = origin/main с #1000–#1004). **34 коммита** (2 docs-планирование + 8 срезов S1–S8 × (код+docs+push-подтверждение)).
> Merge в main **НЕ выполнялся** (prod-freeze до 22.09 ~03:11 MSK + чекпоинты +24h/+48h) — решение за владельцем. PR не создавался.

## Цель контура (PLAN §0/§10)

Единый mutation gateway: single-writer per session для diagram-truth мутаций. Интерактивные мутации — через ops-пайплайн (POST /operations); full-XML PUT — только холодный fallback для явных системных действий. Минус-код: каждая вытесненная ветка удалена, а не осталась рядом.

## Метрика путей: **1+1+X** (X=3)

- **1 интерактивный канал**: ops via gateway-lane (per-session FIFO, 1 in-flight mutation-запрос).
- **1 cold-канал**: system PUT via lane/gatewayPut (manual save, import, template, restore, page-exit, conflict actions, tobe_publish, snapshot restore, save_all — §9 перманентен).
- **X1** participant/pool — cold навсегда (трансформирующая create, риск #995; PLAN §8).
- **X2** класс C property (camunda custom properties) — cold: ops-перевод требует порта preserve/rebuild-семантики camunda-extensions в серверный applier + golden extensionElements-цикл (отдельная волна после мержа).
- **X4** lane.updaterefs / dataInput/OutputAssociation — needsFullSave (вокабуларая матрица §8, следующая волна).

**Дата смерти `fpc_gateway_cold_fallback` = 2026-10-03** — исполнена в S6 удалением degrade-веток (флаг был kill-switch уровня планирования, в коде не заложен — grep-доказательство EXEC_REPORT_S6). Kill-switch `fpc_gateway_lane` (S1, default ON; OFF = pass-through) сохранён как рововой выключатель.

## Срезы (каждый — VERIFIED-гейт + push)

| Срез | Содержание | Ключевой результат |
|---|---|---|
| S0 | Attribution (блокирующий) | full-PUT на drag = keep-final flush; гипотеза владельца подтверждена; оба baseline'а зафиксированы |
| S1 | Gateway-lane core | per-session lane; busy-poll/sentinel'ы/flushPromise поглощены; explicit chain-token (deadlock-защита); kill-switch |
| S2 | Keep-final → lane | F3-triangulation удалена; перенос без съёма (e2e drag→reload) |
| S3 | Op wave A | elements.move/spaceTool → ops (0 PUT на drag); backend id-индекс + scale-guard 1000эл/50ops = 0.08с; staging guard-перестройка |
| S4 | Artifacts волнами | textAnnotation/association → data-refs → lane в ops (golden-parity); participant cold |
| S5 | Property panel | documentation-дыра закрыта (golden-parity); camunda-атрибуты verbatim + xmlns; класс C fail-closed cold |
| S6 | Degrade-замена | 9 веток → honest modal/inline; **0 silent full-PUT**; аудит PUT (вне lane — 0) |
| S7 | Undo/redo полнота | compensating create с id (8 мапперов × do/undo/redo = 0 PUT); :470 drift-фикс (20/20) |
| S8 | Метрики | persist p95 **207.6 мс < 300**; coverage **100%**; ops **182 B vs 176 KB**; 0 PUT на 20 drag'ах |

## Тест-матрица (финал)

- backend: 58 passed + 3 subtests (applier/parity golden/scale-guard 1000эл·50ops/committed_events/conflict_client_id).
- frontend save-зоны: 562/563 (1 pre-existing hang — запись S5, tech-debt).
- полный сьют: **4011 тестов, 0 новых падений** vs origin/main-baseline (73 pre-existing unique: version-drift appVersion, i18n, dark-theme, presence load-flaky и пр.).
- e2e (локальный стек ветки): async-save operations+persistence **6/6** (same-tab 409 silent-rebase, kill-tab IDB redelivery, offline sync, exactly-once, spaceTool ops, coverage :470 20/20 putBpmn=0); S8-метрики: 20 real drags — все гейты PASS.

## Rollback

1. Полный: revert 32 коммитов срезов (список в FINAL_REPORT.md) либо отказ от ветки целиком (база `2c051887` нетронута).
2. Оперативный (аварийный): `localStorage.fpc_gateway_lane="0"` — lane pass-through (ad-hoc механизмы не восстанавливаются; поддерживаемый режим — lane-on).

## Риски / ограничения

- Класс C property — cold до отдельной волны (X2).
- presence-тесты load-flaky под параллельной нагрузкой (вне save-скоупа, зафиксировано).
- hang-тест saveBpmnState.property-pipeline устарел относительно намеренного transportTimeoutMs=60s (tech-debt, запись S5).
- Drag-окно p95 (718.9 мс) выше S0-baseline — канвас-рендер, контур `feature/canvas-drag-render-perf` (бэклог); p50 идентичен (±1%).
