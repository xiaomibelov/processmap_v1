# JOURNAL — fix/canvas-move-di-desync-409-tracker

## 2026-09-21 — открытие контура (PLAN-фаза)

- Approve владельца: scope = все 4 пункта (F1/F2, F5, модал 409, F3), порядок 1→2→3→4, один контур.
- Baseline: `origin/main @ 90556bae` (C3 #1005 + #1007). Worktree `.wt-canvas-move-di-desync-409-tracker`.
- Skill-gate OK, RAG preflight OK (топ-чанк — FIX_PLAN аудита).
- Первый коммит ветки: PLAN.md + STATE.json (аудит PLAN-гейта в репо, прецедент C3).

## 2026-09-21 — срез S1 DONE (F1/F2, TDD RED→GREEN, e2e PASS)

- Сделано: enrichment `shape.move`/`shape.resize` (positionalSnapshot.js, чистый
  перенос хелперов из createBpmnRuntime ради тестируемости); мапперы допускают
  updateDi-батч (strictIdOf ужесточён до непустой строки); **outbox-латентный баг
  C3-S3**: pushCommand брал только mapped.ops[0] — updateDi-хвост батча терялся
  для elements.move/spaceTool с момента C3. F1-причина оказалась двойной.
- Тесты: RED подтверждён (5 mapper + 3 enrichment + 2 outbox падали по
  правильной причине); GREEN: 86/86 (mapper+enrichment), 164/164 (opsOutbox),
  68/68 (vitest smoke), полный npm test — фейл-сет идентичен baseline (26
  pre-existing, hang saveBpmnState.property-pipeline не мой).
- e2e (локальный стек ветки, docker compose из worktree, порты 35177/38011,
  build s1-local-2): (a) single drag реальной мышью → payload
  [shape.move, updateDi, updateDi], server truth docked ДО restore, putCount=0;
  (b) resize-down реальной мышью → [shape.resize, updateDi, updateDi], docked.
  VERDICT pass=true (e2e/logs/s1-e2e-di-docking.jsonl).
- Метрика 1+1+X: без изменений (backend-diff пуст, новых op-типов/путей нет —
  доказано grep'ом по diff).
- Артефакты: EXEC_REPORT_S1.md, PR_S1.md. Коммит S1 отдельным коммитом.
  PUSH не выполнялся (оркестратор). Следующий: S2 (F5 ops-ack adopt).
