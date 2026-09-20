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
- Результат: lane-core + поглощение ad-hoc + kill-switch `fpc_gateway_lane` (default ON). Подробности: EXEC_REPORT_S1.md, PR_S1.md.
