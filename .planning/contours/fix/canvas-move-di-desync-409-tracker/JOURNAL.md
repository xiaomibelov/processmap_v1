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

## 2026-09-21 — срез S2 DONE (F5 ops-ack adopt, вариант A, TDD)

- Сделано: `_onAck` adopt'ит ack-версию в casVersionTracker (идемпотентно,
  монотонный guard против downgrade от stale-ack). syncStateStore — прежний
  внутренний трекер outbox; вариант B НЕ реализован (отдельный approve).
- Обязательный артефакт WHY_NO_CROSS_TAB_HEAL.md: heal adopt'ит только
  входящие версии от другой вкладки — одиночная вкладка 2ce69bd74c не имела
  publisher'а, adopt физически невозможен; adopt-on-clean не лечит dirty;
  live-evidence baseSent=31 vs server 33 подтверждает инвариант-нарушение до
  CAS-запроса. Вердикт: B не нужен как обязательный (дрейф-риск T3).
- Тесты: RED (adopt + идемпотентность падали), GREEN 37/37 (файл), 175/175
  (opsOutbox+snapshot), полный npm test — фейл-сет как у baseline.
- Артефакты: EXEC_REPORT_S2.md, PR_S2.md. Коммит отдельный. PUSH нет.
  Следующий: S3 (модал 409: единый reader версий + clientBase + changed_keys).

## 2026-09-21 — срез S3 DONE (модал 409: единый reader + clientBase + changed_keys, TDD)

- Сделано: canonical reader'ы readConflictChangedKeys /
  readConflictClientBaseVersion (casResponse.js) — detail-вложенная (PUT /bpmn,
  POST /operations), плоская data (meta PATCH), errorDetails; conflict-запись
  координатора несёт changedKeys + clientBaseVersion (base на момент
  отправки); resolveHybridConflictNotice (чистый helper) + conflictNotice
  полный; hybrid-модал в ProcessStage получает clientBaseVersion+changedKeys;
  saveBpmnState onConflict на canonical reader'ах + changedKeys.
- «?» только при реальном отсутствии; легитимный null (BASE_VERSION_REQUIRED)
  сохраняется; дефолты не выдумываются.
- Тесты: RED (3 reader + 3 coordinator-record + 2 hybrid-notice), GREEN 27/27
  затронутые, session-зоны 26/26, stage/ui+utils+hybrid 195 (1 pre-existing
  fail «session presence default ttl», verified на чистом HEAD через stash).
- Артефакты: EXEC_REPORT_S3.md, PR_S3.md. Коммит отдельный. PUSH нет.
  Следующий: S4 (F3 reconnect companion updateDi).
