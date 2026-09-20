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

## 2026-09-20 — S5 property panel → ops (Agent 2, Executor)
- Инвентаризация писателей первым шагом (классы A/B/B2/C, file:line в EXEC_REPORT_S5).
- ДЫРА закрыта: documentation moddle rows молча терялись sanitize'ом → фантомный no-op op; теперь serializeDocumentationRows + backend replace-children (golden parity). camunda-атрибуты verbatim + applier xmlns-declaration (unbound prefix краш).
- Класс C (camunda custom properties) — explicit cold (needsFullSave, #995); boundary-apply подавлен (suppressCommandStackRef) — фантомный op/двойной PUT устранены.
- e2e по классам PASS (0 PUT / 1 ops, reload server truth). Полный сьют 4002, 0 новых падений. Метрика путей 14→13.
- Hang-тест: transportTimeoutMs=60_000 намеренно → тест устарел, не дыра S5 (tech-debt, эскалация).

## 2026-09-20 — S6 degrade-замена (Agent 2, Executor)
- 9 degrade-веток переклассифицированы: conflictStop (gate armed → honest modal, буфер pending) / inlineStop (422/transport, backoff-retry 1s→8s). degrade() удалён как класс; UI-стадии ops-conflict/unsupported/error. needsFullSave — explicit cold.
- fpc_gateway_cold_fallback никогда не был в коде (grep 0) — смерть флага = удаление веток, дата 2026-10-03.
- Аудит PUT: все сайты lane-участники/cold-документированы; вне lane — 0.
- e2e-регресс на ИЗОЛИРОВАННОМ стеке wt-mgc3-s6 (чужая сессия останавливала общий): undo/redo PASS; repo-спеки 5/6 (same-tab 409 silent-rebase, kill-tab, offline, exactly-once, spaceTool); :470 coverage 18/20 = pre-existing drift (доказано stash-прогоном на S5), ре-базелина — S8.
- Метрика путей 1+1+X (X=4). Полный сьют 4002, 0 новых падений.

## 2026-09-20 — S7 undo/redo полнота (Agent 2, Executor)
- Undo delete → compensating create с id: ключевая находка — undo delete фаерит 'id.updateClaim' (пустой дескриптор); enrichment доснимает post-undo live-ref из elementRegistry; redo → delete-op. snapshotElementRef +parentId/endpoints/text; backend text-on-create.
- Undo spaceTool/label-annotation: inverse по post-undo live-снапшоту (bounds/waypoints восстановлены на undo-changed), fail-closed.
- :470 pinpoint: documentation-as-string (S5-регрессия маппера), НЕ lane.updaterefs; фикс → спека 20/20=1.00 putBpmn=0 PASS.
- e2e undo-матрица 8 мапперов PASS (0 PUT на все фазы). X3 закрыт; класс C — cold (порт preserve/rebuild-семантики, #995). Метрика 1+1+X (X=3). Полный сьют 4011, 0 новых падений.

## 2026-09-20 — S8 метрики приёмки + FINAL REPORT (Agent 2, Executor)
- Drag-end flush (onDiagramDragEnd → flushNow): persist p50 30.3 / p95 207.6 / p99 329.9 мс (<300 PASS, n=20 real drags, 300 эл.); coverage 100%; ops ~182 B vs 176 KB PUT; 0 PUT на drag. Оба S0-baseline'а зафиксированы (572.3 окно — канвас в бэклоге; ~450 PUT → ops-ack).
- e2e async-save 6/6 (:470 20/20). Полный сьют 4011 (presence load-flaky 1 имя, изолированно 5/5). FINAL_REPORT: цели §10 vs факт — все достигнуты. Метрика 1+1+X (X=3). Дата смерти 2026-10-03.
- Merge НЕ выполнялся (prod-freeze до 22.09 ~03:11 MSK + чекпоинты) — решение владельца. Контур READY_FOR_REVIEW.
