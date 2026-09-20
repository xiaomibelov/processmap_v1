# PLAN — feature/mutation-gateway-c3

Дата: 2026-09-19. Роль: Agent 1 (Planner). Тип: feature (strangler-миграция save-пайплайна). Код в PLAN-фазе не писался.
Baseline: **`origin/main @ 2c051887`** (по решению владельца при approve; включает #1000–#1004: C1 overlays-crash, C2 silent self-rebase, #1004 e2e-org-scope). file:line-референсы §2–§3 верифицированы на 29640de0; дельта 29640de0→2c051887 — только `test(e2e)` (#1004), на save-путь не влияет; Executor в начале EXEC обязан повторить `git fetch origin` и зафиксировать фактический HEAD.

## Approve-протокол (владелец, 2026-09-19)

PLAN.md **approve** со следующими обязательными условиями EXEC-фазы:

1. Ветка `feature/mutation-gateway-c3` — от **фактического** `origin/main` на момент EXEC (`2c051887`, включает #1004), не от зафиксированного ранее 29640de0.
2. Первый коммит ветки: `PLAN.md` + `STATE.json` в `.planning/contours/feature/mutation-gateway-c3/` (аудит PLAN-гейта в репо).
3. **S0 (attribution, 0.5 дн) — блокирующий**: повторить V5-сценарий live и объяснить источник full-PUT до любых изменений кода. Проверяемая гипотеза владельца: PUT = keep-final flush координатора по `notifyPositionalPending` после drag-end (`createLocalMutationStaging.js`, ветка `STAGE_POSITIONAL_CHANGE`).
4. Дата смерти full-PUT fallback — **явной датой: 2026-10-03** (последний день существования `fpc_gateway_cold_fallback`; после даты флаг и вытеснённые fallback-ветки удаляются, либо контур эскалируется владельцу). Дата фиксируется в READY_FOR_EXECUTION и в каждом PR контура.
5. Метрика «пути записи до/после» (18 → 1+1) — в описании каждого PR контура.
6. Приёмка drag p95 < 50 мс @1000+ эл. — только на **реальном mouse drag** (R-2), не на синтетике. **→ Отменено решением владельца 2026-09-20**: приёмка разделена, drag p95 < 50 мс убрана из C3 и передана в бэклог-контур `feature/canvas-drag-render-perf`; C3 владеет save-путём (§10). Реальный mouse drag как методика сохраняется для save-метрик (S0-методика).
7. Merge/deploy/PR — только по explicit approve владельца; PR и его описание — на русском.

## 0. Резюме

Единый mutation gateway: **single-writer per session** для diagram-truth мутаций. Все интерактивные мутации (move/positional, spaceTool, property panel, direct editing, artifact-типы) идут через ops-пайплайн; full-XML PUT — только холодный fallback для явных системных действий. Словарь ops расширяется с серверной валидацией аплаера (урок E3: небезопасное — fail-closed с явным кодом отказа, никогда невалидный XML). Минус-код — цель: каждая вытесненная ветка удаляется, а не остаётся рядом.

Оценка: **8–12 дн** (как в CONSOLIDATION-PLAN, C3 поглощает F4).

## 1. Источники и верификация входов

Прочитано и сверено с кодом **origin/main @ 29640de0** (чтение через `git show origin/main:` из checkout `pm-main-audit`; working tree checkout'а старше — не использовался для line-ссылок):

- `audit/save-pipeline-big-review/CONSOLIDATION-PLAN.md` (T1) — актуален; T1 = этот контур.
- `audit/save-pipeline-big-review/evidence/A5-map.md` — 18 путей/13 таймеров/9 degrade-веток верифицированы; **устарело** по двум пунктам (см. §2).
- `fix/canvas-overlays-preferences-409/evidence/F4-inventory.md` — S1–S6 направления приняты; описание positional-ветки устарело (см. §2).
- `audit/c1-c2-stage-verification/V5_PERF.md` — baseline «до»: drag p50 309.9 / p95 312.2 мс (602 элемента, ~130 мс из них синтез ввода); moveShape → 1 full-XML PUT, 0 ops POST; водопад 50 req / 8.06 MB.
- `fix/self-conflict-silent-rebase/PLAN.md` (C2, MERGED #1003) — контракты `conflictSilentRebase.js` и hook `trySilentRebase` — часть baseline, переиспользуются как есть.
- Архитектура step1/step2 (#989/#992) — ops-outbox + IDB-journal + SSE `ops_committed` + `opsRebase` — часть baseline.
- Урок E3 (unsafe BPMN-типы → fail-closed full-save): закреплён в коде как `_UNSAFE_FULL_SAVE_ONLY_BPMN_TYPES` (`backend/app/save_services/ops_applier.py:53-62`) + `FULL_SAVE_REQUIRED_BPMN_TYPE_PATTERN` (`commandToOps.js:201-206`) — сохраняется как принцип при расширении словаря.
- RAG preflight (planner): facts-only, BM25 пуст. Релевантные факты: (а) «Diagram drag lag remained after multiple performance contours» — perf-контуры `perf/diagram-modeler-drag-hot-path…` и `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1` имеют `user_visible=not_solved, accepted=false` → приёмка только на **реальном mouse drag**, не синтезе; (б) «React bundle ~95% CPU during drag» — риск для метрики p95 <50 мс (см. R-2).

## 2. Что изменилось в baseline с момента аудита (382a3c14 → 29640de0)

1. **#1003 (C2) в main**: `conflictSilentRebase.js` (новый модуль, помечен «Контракт для C3»), `trySilentRebase` hook в `saveCoordinator` 409-ветке (`saveCoordinator.js:607-622`, регистрация `:137`), rawXml silent-rebase с бюджетом (`createBpmnPersistence.js:101-126, 184-221`), meta silent-rebase (`sessionPatchCasCoordinator.js:106-135`), outbox gate-block обработка (`createSaveOutbox.js:522-528, 540-558`), persist `syncState.lastServerVersion` после rebase (`:784-797`). Вывод аудита «409 → gate → модал единственный исход» устарел.
2. **#1002 (C1) в main**: только `v2OverlayCoordinator` — на save-путь не влияет, но `loadServerXml` восстанавливает оверлеи — e2e-репро обязан инструментировать pageerror (`_addOverlay`).
3. **Positional-ветка staging уже консультирует outbox**: `createLocalMutationStaging.js:183-209` — positional → `autosaveSkipped`, затем `shouldSkipAutosave(command)` (:200-209); ops-captured positional **не флашит full-save** (комментарий :236-240, positional-таймер запрещён). Утверждение F4 «безусловный full-XML flush 500 мс» на 29640de0 не воспроизводится в коде.
4. **Противоречие, требующее атрибуции**: V5 измерен на stage @29640de0 и всё же показал **1 full-PUT на moveShape, 0 ops POST**. Код говорит «ops-captured positional → no full-save». Объяснение не зафиксировано (гипотезы: synthesized drag не проходит `commitDrag`-путь; drag-final таймер опережает ops-flush и pendingPositionalChange не покрыт предикатом; pending `needsFullSave` из смежной команды; outbox неактивен в headless-контексте). → **S0 обязателен до любых изменений.**
5. Прямые PUT вне пайплайнов (актуальные точки): `ProcessStage.jsx:1678/1751/2668/2753`, `App.jsx:3839` (tobe_publish), `useSessionActivationOrchestration.js:392` (snapshot restore), fallback `saveBpmnState.js:72-79`. Референс аудита «ProcessStage.jsx:272» не существует.

## 3. Текущая карта записи (origin/main @ 29640de0, file:line верифицированы)

Пайплайны `saveCoordinator` (queueKey `pipeline::sessionId`, `saveCoordinator.js:49-56` — per-pipeline, per-session очереди НЕТ):
- `ops` — outbox (`createSaveOutbox.js`), delta POST /operations;
- `rawXml` — `createBpmnPersistence.saveRaw:870-1019` (coordinator autosave/drag, manual save, xml-tab snapshot);
- `xml` — `saveBpmnState.js:134` (property/save_all; транспорт может звать `flushSave` или прямой `apiPutBpmnXml:72-79`);
- `meta`/`analysis` — PATCH, base at send time, `enqueueSessionPatchCasCoordinator.js:187-207`;
- прямые `apiPutBpmnXml`/`apiPatchSession` — 7+ точек (см. §2.5).

Ad-hoc взаимные исключения (заменяются gateway-lane): outbox busy-poll 200 мс (`createSaveOutbox.js:261-270, 493-502`), `fullSavePreserve` sentinel (`:227-231, 482-483, 943-956`), `manualSaveCoveredOpIds` (`:218-226, 928-966`), coordinator `flushPromise` сериализация (`createBpmnCoordinator.js:821-888`), `beginSingleWriter` lane (`:202-246`), `saveQueuedRev` coalescing (`:706-715`).

Backend: op-матрица фронт/бек идентична (`commandToOps.js:297-311` ↔ `ops_applier.py:703-727`); разрывы: `elements.move`, `spaceTool`, `lane.updaterefs`, artifact-типы (обе стороны fail-closed). `_mark_diagram_truth_write` со `client_id` во всех 19 call sites — подтверждено (C2 closure). Ограничения батча 1..200 ops (`legacy_api.py:349-386`); фронт шлёт ≤50. **Backend perf-долг**: каждый op-handler O(N) по `root.iter()` без id-индекса; за батч — 2 полных парса XML + sha1 + derivatives (LRU-16 миссует на свежем XML). Масштабный гард только 600 эл./24 ops <5 s.

## 4. Bounded scope

**IN:**
1. Gateway-core: per-session single-writer lane для diagram-truth мутаций (ops/rawXml/xml + прямые PUT), поглощение ad-hoc взаимоисключений; meta/analysis остаются per-pipeline (disjoint-key семантика и silent-rebase контракт C2 сохраняются).
2. Оп-vocabulary: `elements.move` (батч shape.move), декомпозиция `spaceTool`/`lane.updaterefs` → shape.move + element.updateDi, artifact-типы волнами (textAnnotation/association → data-refs → lane; participant — решение по прототипу), property panel → element.updateProperties; backend-валидация с явными кодами отказа (E3), id→element индекс в applier.
3. Устранение full-XML PUT из интерактивных путей; холодный fallback с датой смерти (§9); удаление вытеснённых веток (минус-код).
4. Интеграции через gateway (не параллельно): `trySilentRebase`/conflict gate, outbox flush, presence/soft-lock (единая точка знания о in-flight мутации), SSE remote-apply echo-протокол.
5. Undo/redo полнота: undo-of-delete → compensating create-op с DI (вместо needsFullSave), undo coalesced → journal-семантика.

**OUT (явно):**
- **T3/version-tracker финализация — отдельный контур C4** (см. §5).
- Auth/SSE (C5), recovery B20-атрибуция, modeler-rollback property (G7), retention bpmn_versions (G8) — C6-мини-контуры.
- Direct-editing pre-warm (F4/S6) — отдельный perf-мини-контур, не блокирует.
- Canvas/React-рендер оптимизации вне save-контура (фиксируются как зависимость метрики, R-2).
- Backend-структурный рефактор `_legacy_main.py` save-логики — вне контурa.

## 5. Оценка поглощения T3 (единый version-tracker)

Рекомендация: **НЕ поглощать, оставить C4** (`fix/version-tracker-final`, 2–3 дн, после C3 — как в CONSOLIDATION-PLAN). Обоснование:
- T3 = `applyAckToTracker` (dead code, `casResponse.js:113-128`), прямые writers (snapshot-restore, tobe_publish) → bump tracker, убрать внешний React-ref второй источник, version-chip из одного источника. Это UI/источниковая работа, ортогональная gateway-lane.
- C3 уже делает нужный фундамент: gateway-lane делает `saveCoordinator` единственной точкой optimistic bump (все writers проходят через него); C4 тогда сводится к удалению обходных писателей и ref-источника.
- Поглощение увеличит blast radius самого большого контура без выигрыша в критическом пути (perf-метрики не зависят от T3).
- Контрактная граница фиксируется сейчас: **только saveCoordinator бампит tracker; gateway запрещает writer'ам в обход** — C4 опирается на этот инвариант (проверка в REVIEW).

## 6. Целевая архитектура gateway

```
интерактивная мутация (modeling API → commandStack.changed)
  → bpmnWiring capture (без изменений: pushCommand → emitDiagramMutation)
  → commandToOps (расширенный whitelist; miss → не full-save, а gateway.coldIntent())
  → outbox (journal, coalesce, flush triggers)
  → GATEWAY LANE (per sessionId; 1 in-flight mutation-запрос)
      base = casVersionTracker at send time
      transport: POST /operations
      ack → bump tracker (saveCoordinator) + syncState
      409 → opsRebase → (budget) trySilentRebase-contract → conflict gate (честный модал)
  → SSE ops_committed → opsRemoteApply (echo-suppressed)

системное действие (manual save, import, template, restore, page-exit,
                    conflict overwrite/replay, tobe_publish, xml-tab)
  → gateway.putSystem(action) — registered cold path
  → тот же lane (сериализуется с ops), full-XML PUT, source_action атрибуция
```

Принципы:
- **Lane на уровне mutation-intent, не вызова execute** — обязательно из-за вложенного xml→rawXml (`saveCoordinator.js:49-56` комментарий о deadlock); существующий `nested-execute` тест — gate.
- **Конфликт-политика одна**: `conflictSilentRebase.js` (таксономия ключей, `classifyRebaseSafety`) + `trySilentRebase` hook + честный модал для overlap/unknown/chужой writer. Gateway не вводит второй классификатор.
- **Presence/soft-lock**: gateway публикует editing-state из единой точки (in-flight mutation, owner client_id) вместо разнесённых консультаций; subscribe через существующий presence-канал (e2e multiuser-спека сохраняется).
- **Undo/redo** проходит тот же capture; compensating ops строятся из command context (протокол `__pmOpSource/__pmOpId` переиспользуется, replay/remote не становятся ops).

## 7. Срезы, порядок, риски, откат

Каждый срез: отдельный коммит(ы) в ветке `feature/mutation-gateway-c3`, полный прогон characterization-гейта (§10), revert = откат среза. Порядок — от минимального риска к расширению словаря; perf-выигрыш приходит рано (S2).

| Срез | Содержание | Оценка | Главный риск | Откат |
|---|---|---|---|---|
| **S0** | Attribution (БЛОКИРУЮЩИЙ, до любых изменений кода): live-стенд @фактический main, повтор V5-сценария moveShape, объяснение full-PUT. Проверяемая гипотеза владельца: PUT = keep-final flush координатора по `notifyPositionalPending` после drag-end (`createLocalMutationStaging.js`, ветка `STAGE_POSITIONAL_CHANGE`); также гипотезы §2.4 (synthesized drag vs commitDrag; drag-final таймер раньше ops-flush; pending needsFullSave). Закрепление characterization-гейта; drag-профилирование (render vs save) для честной трактовки p95 | 0.5 дн | — (read-only) | n/a |
| **S1** | Gateway-core: per-session lane в saveCoordinator; поглощение busy-poll/preserve-sentinel/flushPromise-триангуляции; прямые PUT регистрируются как lane-участники; тест nested-execute/deadlock | 2 дн | R-1 deadlock | revert; lane за feature-flag `fpc_gateway_lane` |
| **S2** | Positional closure по результатам S0: удаление full-save arm для ops-covered positional, упрощение drag-final/positional таймеров (минус-код); цель — 0 PUT на drag в counters | 1–2 дн | регресс drag-flush (A2-эскалация: потеря последней правки бёрста) | revert + e2e drag→reload |
| **S3** | Op vocabulary wave A: `elements.move` батчем shape.move (backend без изменений); `spaceTool`/`lane.updaterefs` → декомпозиция shape.move+updateDi; backend id→element индекс в `apply_operations` (O(N) за батч), scale-guard @1000 эл. | 2 дн | R-4 конвергенция двух вкладок | revert; флаг `fpc_ops_positional_v2` |
| **S4** | Wave B artifact-типы: textAnnotation+association → ops (обе стороны), затем dataStoreReference/dataObjectReference; lane — по результатам прототипа; participant — прототип, по умолчанию остаётся cold (#995 урок: fail-closed, parity/golden тесты обязательны) | 2–3 дн | R-3 round-trip артефактов | revert; флаг `fpc_ops_artifacts` |
| **S5** | Property panel/property CRUD → element.updateProperties ops (applier пишет attrs verbatim, `ops_applier.py:290-321`); невозможное — cold path через gateway.putSystem | 1–2 дн | R-4, camunda-namespace регистрация | revert |
| **S6** | Degrade-замена: ops degrade (double-409/no-server-xml) → больше не silent full-PUT; → conflict gate + честный модал (C2-контракт). Регистрация системных cold-действий (§9). Удаление вытеснённых веток: needsFullSave-автодеграда из interactive capture, busy-poll остатки | 1 дн | потеря safety-net при rebase-неудаче | revert (safety-net временно сохраняется за флагом до e2e-зелени) |
| **S7** | Undo/redo полнота: undo-of-delete → compensating create-op с полным DI; undo coalesced → journal-семантика вместо needsFullSave; e2e полный цикл undo→redo→reload | 1 дн | R-3 (inverse-маппинг) | revert |
| **S8** | Метрики и приёмка (save-путь): persist-латентность drag-end → server ack, route-counters (0 full-PUT на мутацию), `__PM_OPS_COVERAGE__` ≥95% drag-команд, пути 18→1+1, полный набор save-спек, отчёт до/после. Оба baseline'а из S0: drag-окно 572.3 мс / post-mouseup PUT ~450 мс — в отчёте обязательны | 1 дн | R-6 | — |

Порядок миграции мутаций (внутри срезов): capture/decision-логика (`commandToOps`) → backend-валидация → удаление full-ветки. Никогда наоборот (иначе окно, где обе ветки живут, превращается в drift).

## 8. Op-vocabulary: матрица расширения

| Команда/тип | Сейчас | Цель | Backend-работа | E3-валидация |
|---|---|---|---|---|
| `shape.move` (drag) | ops ✓ | unchanged | id-индекс (S3) | bounds/delta `_require_*` есть |
| `elements.move` | needsFullSave | N×shape.move в одном батче | индекс; нативный op не нужен | per-op bounds |
| `spaceTool` | needsFullSave → 1 full-PUT | декомпозиция shape.move+element.updateDi | нет (reuse) | per-op bounds/waypoints |
| `lane.updaterefs` | needsFullSave | декомпозиция или cold | reuse updateDi/updateProperties | flowNodeRef whitelist |
| textAnnotation/association create | full (обе стороны) | ops | новые handlers: leaf+edge, DI pair, artifactRef; снятие из `_UNSAFE_FULL_SAVE_ONLY_BPMN_TYPES` по одному типу | fail-closed parity; неизвестный artifactRef → 422 explicit code |
| dataStoreReference/dataObjectReference | full | ops | handlers (leaf, DI) | как выше |
| lane (create/update) | full | ops | handler flowNodeRef | как выше |
| participant (pool) | full | **cold по умолчанию** | прототип (processRef minting) — только если дешево | иначе остаётся fail-closed |
| property panel (camunda props) | full | element.updateProperties ops | verbatim attrs уже есть; namespace registration | protected keys (id) — есть |
| direct editing (label) | ops ✓ (updateLabel) | unchanged | — | — |
| undo delete | needsFullSave | compensating create-op + DI | reuse create handlers | full DI payload required |
| undo coalesced | needsFullSave | journal-семантика | нет | — |

Backend схема батча не меняется (open structs). Новые причины отказа — только typed `OperationApplyError` → 422 `OPERATION_UNSUPPORTED` с explicit reason; запрещено «чинить» неизвестное молчаливой записью.

## 9. Холодный fallback и дата смерти

Перманентный cold-path (системные действия, full-XML PUT через `gateway.putSystem`, с атрибуцией `source_action`): manual save/Ctrl+S, import (PUT + multipart), template apply, restore version, page-exit flush, snapshot restore, tobe_publish, conflict overwrite/same-tab replay, xml-tab snapshot save, dead-session restore.

**Дата смерти интерактивного full-PUT: 2026-10-03** (явная дата по approve-протоколу; последний день существования `fpc_gateway_cold_fallback` — после даты флаг и вытеснённые fallback-ветки удаляются, либо контур эскалируется). Конкретно:
- full-save arm из positional-ветки staging — удаляется в S2 (не флаг, удаление);
- автодеграда ops→full (`requestFullSave` из interactive capture, `createSaveOutbox.js:475-487, 508-516`) — удаляется в S6 после зелёного e2e; до того держится за `fpc_gateway_cold_fallback`;
- после мержа C3 в main любой sync full-PUT, порождённый интерактивной мутацией (drag/spaceTool/property/direct-edit/artifact-create), — дефект-регресс (assert в e2e counters).

## 10. Метрики приёмки и методика

**Разделение приёмки (решение владельца, 2026-09-20): C3 владеет ТОЛЬКО save-путём.** Метрика drag p95 < 50 мс из приёмки C3 **убрана** — она переходит в новый контур бэклога `feature/canvas-drag-render-perf` (канвас-рендер ~260 мс из S0-разложения — вне save-контура; R-2 подтверждён S0).

Приёмка C3 (save-путь):
1. **0 sync full-XML PUT** на интерактивную мутацию (route-counters `PUT /bpmn`, `POST /operations`, `PATCH` в окне 6 с после мутации; сценарии: createShape, moveShape реальный drag, multi-select move, spaceTool, label edit, property change, artifact create, undo/redo).
2. **`elements.move` / `spaceTool` → ops**: drag-команды уходят `POST /operations`; **coverage drag-команд ≥95%** по `__PM_OPS_COVERAGE__` (метрика commandToOps.js:92-125), окно замера — серия из ≥20 реальных mouse-drag'ов.
3. **Persist-латентность drag-end → server ack < 300 мс** (замер S0-методикой: центровка viewbox, `elementFromPoint → [data-element-id]`, assert реального смещения; HAR-timing запроса от mouseup до 200-ack).
4. **Пути записи 18 → 1+1**: 1 интерактивный канал (ops через gateway-lane) + 1 cold-канал (system PUT через `gateway.putSystem`). meta/analysis PATCH не считаются diagram-записью (disjoint-key, отдельная CAS-очередь сохраняется). Прямые PUT вне lane после C3: 0.
5. **Один in-flight mutation-запрос на сессию** (gateway-lane; assert в characterization-тесте).
6. **Backend ops-latency**: p95 apply батча ≤ 300 мс @1000 эл. (id-индекс; scale-guard в pytest).
7. **Регрессионный gate**: все спеки §11 зелёные; новых падений 0 vs origin/main.

S8-отчёт обязан указать оба S0-baseline'а: **drag-окно p95 572.3 мс** и **post-mouseup PUT ~450 мс** — и к чему пришли по каждому (drag-окно ожидаемо почти не меняется — оно канвас; post-mouseup PUT должен уйти в ops-ack < 300 мс).

## 10а. Передано в бэклог (вне C3)

Контур `feature/canvas-drag-render-perf`: канвас-рендер bpmn-js/оверлеи (~260 мс из S0-разложения), React ~95% CPU drag (RAG-факт), target drag p95 < 50 мс @1000+ эл. Активация — отдельным approve владельца.

## 11. Тест-матрица

**Unit (vitest):** `commandToOps` новые мапперы/матрица; gateway lane (serialization, nested-execute, intent-level reentrancy); staging positional-предикат; undo-of-delete inverse; applier-валидация матрица (fail-closed случаи → explicit code).

**Backend (pytest):** новые op-handlers (textAnnotation/association/data-refs) + parity/golden; `test_ops_applier_parity.py` scale-guard расширен до 1000 эл./50 ops; id-индекс эквивалентность; typed 422-матрица; client_id-регресс (`test_conflict_last_write_client_id.py`) зелёный.

**e2e (playwright):** drag→0 PUT (S2); spaceTool/multi-select→ops (S3); artifact create→ops + reload-равенство (S4); property→ops (S5); degrade→модал, cold-actions PUT (S6); undo/redo full cycle (S7); **регрессия C1/C2**: `async-save:625` (same-tab 409→auto-rebase без модала), silent-rebase disjoint/overlap, `_addOverlay` pageerror-assert, gate/stranded-op; **multiuser**: `async-save-multiuser.spec.mjs` (конвергенция, proposed-changes, offline catch-up); persistence: `async-save-persistence.spec.mjs` (kill-tab redelivery, exactly-once).

**Perf:** S0/S8 — drag-замер, longtasks-observer, counters, waterfall; отчёт до/после приложить к EXEC_REPORT.

## 12. Риски

| # | Риск | Митигация |
|---|---|---|
| R-1 | Deadlock вложенного execute (xml→rawXml) при lane | lane на intent-уровне; `saveCoordinator.nested-execute` + новый deadlock-тест; постепенный rollout за `fpc_gateway_lane` |
| R-2 | ~~Drag p95 не достигается~~ — **закрыто решением владельца (2026-09-20): приёмка разделена**, канвас-рендер (~260 мс, S0) вынесен в бэклог-контур `feature/canvas-drag-render-perf`; C3 владеет save-путём (§10) | S0-разложение зафиксировано; S8 отчитует оба baseline'а (572.3 мс drag-окно / ~450 мс post-mouseup PUT) |
| R-3 | Round-trip артефактов (#995 урок): ops-запись портит XML, который full-PUT писал корректно | fail-closed по типам, parity/golden обязателен до снятия FULL_SAVE pattern; «сомнение → cold» |
| R-4 | Двухвкладочная конвергенция ломается при новых ops | `async-save-multiuser` на каждом срезе S3–S5; echo-suppression протокол не менять |
| R-5 | Дрейф границы с C4 (tracker) | инвариант «только saveCoordinator бампит» закреплён в S1 + проверка в REVIEW; C4 отдельным контуром |
| R-6 | Stage-флап при верификации | деплой/репро по согласованному окну; локальный стек как primary для e2e, stage — финальная проверка |
| R-7 | S0 покажет, что full-PUT на moveShape — не save-путь (напр. инфраструктура замера) | план срезов адаптируется в начале EXEC без смены scope; фиксация в EXEC_REPORT |

## 13. Критерии готовности (для approve → EXEC)

1. S0-атрибуция выполнена, объяснение V5-противоречия зафиксировано.
2. Gateway-lane работает, ad-hoc исключения удалены (минус-код подтверждён diffstat).
3. Метрики §10 достигнуты на локальном стеке + stage-окно.
4. Весь §11 зелёный, 0 новых падений vs origin/main.
5. Метрика путей: 18 → 1+1, прямые PUT вне lane = 0.
6. Дата смерти интерактивного full-PUT исполнена (§9).
7. git-proof + handoff-proof по шаблону AGENTS.md §8.

## 14. Git-proof baseline (для Executor'а, выполнить в начале EXEC)

```bash
cd <canonical checkout>   # чистый worktree от origin/main
git fetch origin
git rev-parse origin/main   # ожидается 2c051887 (по approve-протоколу) или свежее; если свежее — зафиксировать дельту и перепроверить §2/§3
git checkout -b feature/mutation-gateway-c3 origin/main
git rev-parse HEAD; git status -sb
# Первый коммит ветки — ТОЛЬКО: .planning/contours/feature/mutation-gateway-c3/PLAN.md + STATE.json (аудит PLAN-гейта)
```

Ориентировочный diffstat: `saveCoordinator.js` (lane ±150), `createSaveOutbox.js` (−100..−200 busy-poll/preserve), `createBpmnCoordinator.js` (−80..−150 таймеры), `createLocalMutationStaging.js` (−40..−80), `commandToOps.js` (+200 mappers), новый `gateway` модуль (+250), `ops_applier.py` (+250 handlers/index), `legacy_api.py` (0 или точечно), тесты (+800). Цель по нетто-строкам save-ядра: **минус**.

## 15. Открытые вопросы (решить в EXEC, не блокируют approve)

1. `elements.move` — нативный op vs батч shape.move (склонность: батч, §8).
2. participant/pool — в ops или остаться cold (прототип S4).
3. xml-tab snapshot save — cold path или конвертация в ops (по умолчанию: cold).
4. Флаг-стратегия: отдельные флаги на срез vs один `fpc_gateway_*` (по умолчанию: на срез, снятие флага = удаление ветки).
