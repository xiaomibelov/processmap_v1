# JOURNAL — feature/mutation-gateway-c3

## 2026-09-19 — PLAN-фаза (Agent 1, Planner)
- PLAN.md + STATE.json зафиксированы, аудит PLAN-гейта в репо (коммиты `cc7a0f6`, `625359a`).
- Approve владельца с 7 условиями (baseline `2c051887`, S0 блокирующий, дата смерти `fpc_gateway_cold_fallback` = **2026-10-03**, метрика 18→1+1 в каждом PR, merge/deploy/PR только по explicit approve).
- Решение владельца 2026-09-20: приёмка разделена — drag p95 < 50 мс убрана из C3, передана в бэклог-контур `feature/canvas-drag-render-perf`; C3 владеет save-путём.

## 2026-09-19 — S0 attribution (Agent 2)
- Статус: `confirmed_with_amendments` (S0-ATTRIBUTION.md, evidence/s0/).
- Гипотеза владельца подтверждена по существу: full-PUT на drag = keep-final flush координатора по `notifyPositionalPending` (20/20 real drags).
- Ключевые уточнения: реальный drag = `elements.move` (вне whitelist → needsFullSave); synthesized moveShape создаёт op, но PUT-ack перекрывает буфер раньше ops-flush → 0 POST в V5.
- S3-блокер найден: runtime snapshot теряет `context.elements` для `elements.move` (нужен починка `snapshotCommandContext` для батч-маппинга shape.move).

## 2026-09-20 — S1 gateway-lane (Agent 2, Executor)
- Цель среза: per-session mutation lane в saveCoordinator + поглощение ad-hoc взаимных исключений (busy-poll 200 мс, fullSavePreserve/manualSaveCoveredOpIds sentinel-пара, coordinator flushPromise triangulation).
- Дизайн-решение RED-фазы: reentrancy lane — СТРОГО по явному токену chain (transport 4-й аргумент → `options.laneContext` → `payload.mutationLaneContext`); временная эвристика «вызов во время занятой lane» отвергнута — неотличима от внешнего вызова (первая итерация GREEN давала конкурентный ops-flush, поймано тестами).
- Entry-time проверки outbox-flush (degraded/offline) перепроверяются внутри lane-task — иначе отложенный flush исполнялся по устаревшему состоянию (поймано тестом 422-bounded-retries).
- Результат: lane-core + поглощение ad-hoc + kill-switch `fpc_gateway_lane` (default ON). VERIFIED гейтом владельца, push: HEAD `e8919198`. Подробности: EXEC_REPORT_S1.md, PR_S1.md.

## 2026-09-20 — S2 positional keep-final → lane (Agent 2, Executor)
- Цель: keep-final flush (drag-final/positional таймеры → flushSave → rawXml) как полноценный lane-участник; ad-hoc наложение F3 (guard `!saveInFlight` + re-arm в finally ×2) удалено — lane даёт детерминированный defer, base-at-send-time из tracker.
- RED→GREEN: latency-тест поймал F3 re-arm debounce (21 мс) → после снятия guard'а latency <10 мс; обе F3-характеризации остались зелёными без правок (контракт теперь даёт lane).
- **Перенос без съёма** (инвариант владельца №1): e2e-гейт на ЛОКАЛЬНОМ стеке ветки 2/2 PASS — реальный drag T_5 (+60,+20 после snap), keep-final `PUT /bpmn` через 524 мс после mouseup, reload → элемент на месте, серверный XML (1360,80). Чужой стек `wt-audit-canvas-409` (8011/5177) не тронут; свой `wt-mgc3-s2` (API 18011, frontend 15177).
- **s3_pinpoint (без фикса)**: `elements.move` context = `{delta, parent}` — `shapes` теряется: diagram-js `moveElements` кладёт `shapes` (Modeling.js:236-243), `snapshotCommandContext` маппит только `elements`. Фикс ~4-8 строк runtime в S3 + маппер батч shape.move.
- Полный сьют: 3978 тестов, 0 новых падений vs S1-baseline. Артефакты: EXEC_REPORT_S2.md, PR_S2.md.

## 2026-09-20 — S3 op wave A (Agent 2, Executor)
- elements.move → батч shape.move (+undo -delta) + affectedConnections updateDi; spaceTool → декомпозиция move+resize+updateDi (resizeBounds-parity SpaceUtil). Runtime-снапшот: shapes/movingShapes/resizingShapes/hints/direction/start + affectedConnections enrichment (вложенные diagram-js обновления «тихие» — commandStack.changed только outermost).
- Находки GREEN-итераций: strictIdOf (elementIdOf пустой id → '[object Object]'); снапшот терял direction/start (e2e gate (c) поймал full-PUT); e2e ack-гонка на reload (postOpsDone).
- Staging: консультация outbox первой, keep-final arm гаснет при захвате → full-save arm positional-ветки вытеснен (durability на каждом префиксе: drag→ops с коммита a244c00b).
- Backend: _ElementIndex (O(N)/батч, self-healing, create/delete maintenance), scale-guard 1000эл/50ops = 0.08s.
- e2e (a)-(d) PASS на контейнере: drag/multi/spaceTool/createShape — 0 PUT /bpmn, ≥1 POST /operations, reload-равенство. Полный сьют 3988, 0 регрессий (presence-poller — load-flaky семейство, имя плавает между прогонами).
- Метрика путей: 18→17. Артефакты: EXEC_REPORT_S3.md, PR_S3.md. evidence/s3/.

## 2026-09-20 — S4 artifact-типы волнами (Agent 2, Executor)
- w1 textAnnotation+association: golden full-PUT (lane OFF) → `<bpmn:text>` child; association без incoming/outgoing; updateLabel аннотации → text+resize ops, undo→needsFullSave. w2 data-refs: companion DataObject (golden: клиент минтит, сервер повторяет; delete каскадит). w3 lane: laneSet mint/processRef/isHorizontal; populated lane delete → typed 422 lane_not_empty.
- participant/pool — cold навсегда (трансформирующая create, риск #995, PLAN §8).
- Находки: restart api обязателен после backend-правок (uvicorn держит код в памяти, 422 на свежих типах — поймано e2e-итерациями волн 2/3).
- e2e-гейты всех волн PASS на контейнере (create/move real-drag/delete → 0 PUT /bpmn, ≥1 POST /operations, reload server truth). Полный сьют 3997, 0 новых падений. Метрика путей 18→14.
