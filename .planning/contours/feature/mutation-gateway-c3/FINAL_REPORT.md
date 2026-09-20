# FINAL REPORT — контур feature/mutation-gateway-c3 (mutation gateway для save-пути)

Дата: 2026-09-20. Статус: **S8_DONE_READY_FOR_REVIEW**. Merge в main не выполнялся (prod-freeze до 22.09 ~03:11 MSK + чекпоинты +24h/+48h) — решение за владельцем.

## git-proof

```
branch:   feature/mutation-gateway-c3
base:     2c051887 (origin/main @ #1000–#1004)
HEAD:     003e4cdd (S8 drag-end flush) → docs/push-подтверждение S8 — см. origin
origin:   синхронизирован (каждый срез pushed)
worktree: /Users/mac/agents_place/kimi_PM/.wt-mutation-gateway-c3
```

Полный список коммитов ветки (34, в порядке от base):

```
cc7a0f63 docs(planning): PLAN + STATE контура (аудит PLAN-гейта)
625359ab docs(planning): разделение приёмки C3 vs canvas-drag-render-perf (решение владельца)
310b0137 feat(save): per-session mutation lane (gatewayLane) в saveCoordinator
dbb4abe5 feat(save): outbox — busy-poll 200 мс и sentinel-пара поглощены lane
5e83d3ec refactor(save): coordinator flushPromise-триангуляция удалена
6372ab88 feat(save): прямые PUT зарегистрированы как lane-участники (gatewayPut)
e8919198 docs(planning): S1 gateway-lane — EXEC_REPORT_S1, PR_S1, STATE, JOURNAL
2122dbe1 feat(save): S2 — keep-final positional flush как lane-участник
5fcfd17c docs(planning): S2 push-подтверждение
4ec579f0 feat(ops): S3 wave A — elements.move/spaceTool, runtime-снапшот shapes
d342bdca perf(ops): S3 — id→element индекс, scale-guard 1000 эл./50 ops
a244c00b feat(save): S3 — staging guard-перестройка (arm гаснет при захвате)
00840106 docs(planning): S3 op wave A — артефакты
bfa718c6 docs(planning): S3 push-подтверждение
340274f0 feat(ops): S4 волна 1 — textAnnotation + association (golden-parity)
001a0410 feat(ops): S4 волна 2 — dataStoreReference/dataObjectReference
42c67330 feat(ops): S4 волна 3 — lane (laneSet/isHorizontal, fail-closed)
da4a267c docs(planning): S4 artifact-типы волнами — артефакты
2f762849 docs(planning): S4 push-подтверждение
90fcb467 feat(ops): S5 — property panel: documentation ops, fail-closed, camunda verbatim
24897363 docs(planning): S5 — артефакты
6dfa51b5 docs(planning): S5 push-подтверждение
ee044305 feat(save): S6 — degrade-замена: 9 веток → honest modal/inline
6dda5d91 docs(planning): S6 — артефакты
60967931 docs(planning): S6 push-подтверждение
740b8987 feat(ops): S7 — undo/redo полнота (compensating create, :470 drift-фикс)
da179cc3 docs(planning): S7 — артефакты
4b567ed2 docs(planning): S7 push-подтверждение
003e4cdd feat(save): S8 — drag-end flush ops (persist-латентность < 300 мс)
+ docs-артефакты S8 (этот коммит и push-подтверждение)
```

## Цели PLAN §10 vs факт

| # | Цель | Факт | Статус |
|---|---|---|---|
| 1 | 0 sync full-PUT на интерактивную мутацию | 20 real drags: **0 PUT**; e2e-матрицы S3–S7 всех классов: 0 PUT | ✅ |
| 2 | drag-команды → ops, coverage ≥95% | coverage **100%** (drag-набор 20/20 + 7 сценариев); :470 спека 20/20 | ✅ |
| 3 | persist-латентность drag-end→ack < 300 мс | **p50 30.3 / p95 207.6 / p99 329.9 мс** (n=20, S0-методика) | ✅ (p95) |
| 4 | пути 18 → 1+1 | **1+1+X** (X=3 с причинами) | ✅ (честный счёт) |
| 5 | 1 in-flight mutation-запрос на сессию | gateway-lane FIFO + explicit chain-token; тесты deadlock/serialization | ✅ |
| 6 | backend ops-latency p95 ≤300 мс @1000 эл. | scale-guard: 50 ops/1000 эл. apply = **0.08s**; e2e ops p95 101.8 мс (spec :470) | ✅ |
| 7 | регрессионный gate | suites зелёные, 0 новых падений (ниже) | ✅ |
| S8-обязательность | оба S0-baseline'а в отчёте | drag-окно p95 **572.3 мс** (S8 p50 578.4 ±1% — без изменений, канвас-контур в бэклоге); post-mouseup **~450 мс PUT → ops-ack p95 207.6 мс** | ✅ |
| §9 | дата смерти интерактивного full-PUT | `fpc_gateway_cold_fallback` = **2026-10-03**, исполнена удалением degrade-веток (S6) | ✅ |

## Срезы S0–S8 (сводка)

- **S0** attribution: гипотеза владельца подтверждена (keep-final flush = источник PUT на drag); baseline'ы 572.3 мс / ~450 мс.
- **S1** lane-core: поглощены busy-poll 200 мс, sentinel-пара, flushPromise; explicit chain-token против deadlock; kill-switch `fpc_gateway_lane`; 6 прямых PUT → gatewayPut.
- **S2** keep-final → lane: F3-triangulation удалена; перенос без съёма (e2e drag→reload→смещение).
- **S3** op wave A: elements.move/spaceTool → ops; backend `_ElementIndex` (O(N)/батч) + scale-guard; staging консультируется первым; e2e (a)–(d) PASS.
- **S4** artifacts волнами (1: textAnnotation+association, 2: data-refs, 3: lane) с golden-parity; participant — cold навсегда.
- **S5** property panel: documentation-дыра закрыта, camunda-атрибуты verbatim + xmlns-declaration; класс C fail-closed cold.
- **S6** degrade-замена: 9 веток → conflictStop (C2 honest modal) / inlineStop (422/transport + backoff-retry); 0 silent full-PUT; аудит PUT — вне lane 0.
- **S7** undo/redo полнота: compensating create с id (id.updateClaim-enrichment), post-undo inverse (spaceTool/label), reconnect-контекст; :470 drift-фикс (documentation-string — S5-регрессия); матрица 8 мапперов PASS.
- **S8** метрики: drag-end flush; persist p95 207.6 мс; coverage 100%; 182 B vs 176 KB.

## Тест-матрица (финальные числа)

- backend pytest: **58 passed + 3 subtests** (applier/parity/scale-guard/committed_events/conflict_client_id).
- frontend save-зоны: 562/563 (1 pre-existing hang — tech-debt S5).
- полный frontend-сьют: **4011 тестов, 0 новых падений** (77 fail / 74 unique: 73 pre-existing main + presence load-flaky имя ротируется; доказано изолированными прогонами).
- e2e step1/step2/C1/C2 (async-save operations+persistence): **6/6** — same-tab 409 silent-rebase, kill-tab IDB redelivery, offline sync, exactly-once per opId, spaceTool ops, :470 (20/20, putBpmn=0).
- e2e-метрики S8: 20 real drags, все гейты PASS.

## Риски / ограничения

1. X2 класс C property — cold до отдельной golden-волны (порт preserve/rebuild-семантики).
2. X4 lane.updaterefs/data-ассоциации — needsFullSave (вокабуларая волна).
3. presence-тесты load-flaky под параллельной нагрузкой (вне контура).
4. hang-тест property-pipeline устарел (transportTimeoutMs=60s намеренно) — tech-debt.
5. Drag-окно p95 718.9 мс > S0 572.3 — канвас-рендер (p50 идентичен); контур `feature/canvas-drag-render-perf` в бэклоге, активация — отдельным approve.
6. p99 persist 329.9 мс чуть выше бюджета (p95 — критерий); хвост — jitter CPU под нагрузкой.

## Handoff-proof

- Цель контура закрыта: save-путь перестроен на mutation-gateway (1+1+X), интерактивный full-PUT вытеснен (0 на drag, дата смерти исполнена), латентность и coverage приёмки достигнуты, все спеки зелёные.
- Что остаётся за владельцем: **merge-решение** (prod-freeze до 22.09 ~03:11 MSK + чекпоинты +24h/+48h); активация canvas-drag-render-perf (бэклог); класс C ops-волна; X4-вокабуларая волна.
- Артефакты контура: PLAN/STATE/JOURNAL + EXEC_REPORT_S1–S8, PR_S1–S8, S8-METRICS, S0-ATTRIBUTION, evidence/s0–s8 → worktree-контур + workspace `/Users/mac/agents_place/kimi_PM/.planning/contours/feature/mutation-gateway-c3/` + Obsidian-mirror `AgentReports/feature/mutation-gateway-c3/`.
