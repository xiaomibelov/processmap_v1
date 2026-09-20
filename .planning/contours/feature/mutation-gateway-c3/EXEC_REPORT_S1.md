# EXEC_REPORT — S1 (gateway-lane) контура feature/mutation-gateway-c3

Дата: 2026-09-20. Роль: Agent 2 (Executor). Срез: S1 по PLAN.md §7.
Статус: **DONE** (код + тесты + артефакты; push/PR/merge НЕ выполнялись — по условию владельца).

## Цель среза

Per-session mutation lane в saveCoordinator: один in-flight diagram-truth mutation-запрос на сессию (ops/rawXml/xml + зарегистрированные прямые PUT). Поглощение ad-hoc взаимных исключений:

1. outbox busy-poll 200 мс → детерминированный resume через lane-очередь;
2. пара `fullSavePreserve` sentinel + `manualSaveCoveredOpIds` → единый covered-снимок opId;
3. coordinator `flushPromise` сериализация → сериализация общей lane;
4. lane `beginSingleWriter/endSingleWriter` (owner `template_apply`) — **не тронут** (семантика template single-writer сохранена, registered lane не требуется: single-writer guard проверяется до lane и ортогонален ей).

## git-proof

```
worktree: /Users/mac/agents_place/kimi_PM/.wt-mutation-gateway-c3
branch:   feature/mutation-gateway-c3
base:     625359ab (docs: разделение приёмки C3; parent 2c051887 = origin/main с #1000–#1004)
origin/main: 2c05188726c9228e28af0281f166c99b42e58591 (fetch выполнен, дельты нет)
status до коммитов: clean (изменения только среза S1)
```

Коммиты среза (conventional, описания на русском):
- `<см. git log>` — feat(save): mutation lane …; feat(save): outbox …; refactor(save): coordinator …; feat(save): gatewayPut …; docs(planning): S1 …

## RED → GREEN evidence

### RED (на чистом baseline, до реализации)

Новые/адаптированные тесты, падения по правильной причине (сериализация отсутствует):

| Тест | Причина падения (RED) |
|---|---|
| `saveCoordinator.gatewayLane.test.mjs :: mutation pipelines of one session serialize across pipeline names` | ops-flush стартовал конкурентно с blocked xml (per-pipeline очереди) |
| `saveCoordinator.test.mjs :: mutation pipelines for the same session serialize through the gateway lane` (адаптация бывшего «independent pipelines run on separate lanes») | то же — старый контракт concurrency |
| `createSaveOutbox.test.mjs :: mutual exclusion: ops flush waits while full-save is in flight` (адаптация: убран `fullSaveBusyPollMs: 20`) | busy-poll 200 мс: за 80 мс после release отправка не происходила |
| `createSaveOutbox.test.mjs :: lane resume is deterministic` (новый) | `flushNow` резолвился сразу (null), ops уходили позже по таймеру-пoll |

Итого RED: 4 падения из 57 прогонов затронутых файлов. Остальные новые тесты (независимость сессий, meta bypass, gate-respect, kill-switch, deadlock-guard) — guards, зелёные на обоих контрактах.

### GREEN-итерации (зафиксированные находки)

1. **Итерация 1 (lane с temporal-reentrancy) — отклонена тестами.** Первый вариант lane исполнял inline любой `run` при занятой lane; внешний ops-flush во время in-flight full-save исполнялся конкурентно (3 теста упали). Причина: «вызов во время занятой lane» неотличим от вложенного вызова без контекста.
2. **Итерация 2 (explicit chain-token).** Reentrancy строго по токену: lane передаёт task токен → saveCoordinator пробрасывает его transport'у 4-м аргументом → xml-transport (`saveBpmnState.js`) передаёт во `flushSave` как `options.laneContext` → `createBpmnCoordinator` кладёт в payload как `mutationLaneContext` → вложенный `execute` проходит lane inline. Внешний вызов без токена — всегда FIFO-очередь. Все 4 RED-теста зелёные.
3. **Находка 3:** отложенный lane-task обязан перепроверять entry-time условия (degraded/offline) на момент исполнения — иначе flush, отложенный lane'ом, исполнялся по устаревшему состоянию (поймано тестом 422-bounded-retries: 5 вызовов вместо 4).

## Финальные прогоны (node --test, node v24.21.0)

| Прогон | Зона | Тестов | Pass | Fail |
|---|---|---|---|---|
| baseline (до правок) | save-зоны: session/__tests__, bpmn/save, bpmn/coordinator, bpmn/persistence, stage/utils | 501 | 501 | 0 |
| **S1 финал** | те же save-зоны + process/save | 527 | 526 | 1* |
| baseline (origin/main, чистый worktree) | **весь** frontend (`find src -name '*.test.mjs'`) | 3968 | 3888 | 76 (73 уникальных) |
| **S1 финал** | **весь** frontend | 3975 | 3895 | 76 (73 уникальных) |

\* Единственный fail зон-прогона — `saveBpmnState.property-pipeline.test.mjs :: property save returns error when coordinator transport hangs` — **pre-existing**: воспроизведён на чистом origin/main (transportTimeoutMs xml-пайплайна поднят до 60_000 в прошлом контуре, тест ждёт timeout <15с при hang 12с). Вне контурa S1; рекомендация — отдельный мини-фикс теста (hang >60с или ожидание abort-сигнала).

**Полный сьют: множества падений baseline и S1 идентичны (diff по именам тестов — пустой). 0 новых падений, +7 новых проходящих тестов среза.**

Список 73 pre-existing падений полного сьюта (version-drift `appVersion v1.0.141`, i18n, dark-theme, technologist/UI и пр.) — не относится к save-пути; зафиксирован в репо как tech debt main.

## Diffstat (18 файлов, +694/−196)

| Файл | +/− | Содержание |
|---|---|---|
| `frontend/src/features/session/gatewayLane.js` | +123/−0 | **новый** модуль lane (run/has/clear, kill-switch `fpc_gateway_lane`) |
| `frontend/src/features/session/gatewayPut.js` | +32/−0 | **новый** gateway-API прямых PUT (`gatewayPutBpmnXml`) |
| `frontend/src/features/session/saveCoordinator.js` | +60/−15 | интеграция lane в `_runPipeline`, `mutationLane:false` opt-out, проброс laneContext в transport |
| `frontend/src/features/process/bpmn/save/opsOutbox/createSaveOutbox.js` | +98/−127 | **минус-код**: busy-poll удалён, sentinel-пара → единый covered-снимок, flush как lane-task |
| `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js` | +60/−24 | flushPromise triangulation удалена → lane-task (`flushSaveRun`/`persistExplicitXmlRun`) |
| `frontend/src/features/process/bpmn/save/opsOutbox/opsOutboxConfig.js` | +3/−4 | `fullSaveBusyPollMs` удалён из конфига |
| `saveBpmnState.js` / `createBpmnPersistence.js` | +5/−1, +3/−0 | проброс `laneContext`/`mutationLaneContext` во вложенные save-пути |
| `sessionPatchCasCoordinator.js` / `interviewAnalysisPatchHelper.js` | +3/−0 каждый | `mutationLane:false` для meta/analysis (C2-контракт) |
| `App.jsx` / `ProcessStage.jsx` / `useSessionActivationOrchestration.js` | +12/−9 | 6 прямых PUT → `gatewayPutBpmnXml` |
| тесты (5 файлов адаптировано + 1 новый) | +293/−16 | `saveCoordinator.gatewayLane.test.mjs` (+235), nested-execute → explicit-ctx, abort-signal-wiring → 4-arg transport, outbox адаптации |

Минус-код подтверждён: `createSaveOutbox.js` 1029→1000 строк; net по save-ядру (saveCoordinator + outbox + coordinator + config) = **−84 строк** при добавленной функциональности lane.

## Пути записи: метрика 18 → 1+1 (промежуточное состояние после S1)

Поглощено в S1 (ad-hoc исключения, не пути записи): busy-poll, preserve-sentinel'ы, flushPromise — запись всё ещё идёт прежними путями, но сериализованными единой lane.
Осталось до целевого 1+1 (срезы S2–S6): full-save arm positional-ветки (S2), ops degrade → full-PUT (S6, за `fpc_gateway_cold_fallback`), ручной/системный full-save (cold-канал, перманентен по §9), прямые PUT вне перечисленных 6 точек (audit для S6). Честный статус: **lane-core готов, миграция путей — нет**.

## Риски / ограничения / переносы

1. **Kill-switch `fpc_gateway_lane`** (default ON; `0/off/false` → pass-through). При OFF взаимное исключение ops↔full-save отсутствует (ad-hoc механизмы удалены безусловно — lane-on единственный поддерживаемый режим). Rollback = revert коммитов среза.
2. **Base-at-send-time прямых PUT**: `gatewayPutBpmnXml` сериализует, но не пересчитывает `baseDiagramStateVersion` (вызывающий код считает его до вызова — эквивалент прежнего `await flushPromise`). C4 (version-tracker финализация) вне контура.
3. **Keepalive-unload flush** вне lane (page-exit best-effort, страница умирает) — осознанно.
4. **`isFlushing()`** координатора теперь через `lane.has(sid)` — семантика «save busy» сохранена.
5. **Deadlock-риск (R-1) закрыт**: explicit token + тесты (nested-execute, gatewayLane nested, outbox mutual-exclusion, 422-bounded). Тemporal-эвристика отвергнута с записью причины.
6. **Pre-existing fails main** (73 шт. полного сьюта + property-pipeline hangs) — tech debt вне контура; зафиксировано, не чинилось (bounded scope).
7. **Перенос на S2+**: positional closure (S2), op-vocabulary (S3–S5), degrade-замена + регистрация оставшихся cold-действий (S6), undo/redo (S7), метрики (S8).

## Handoff-proof

- Цель среза закрыта: lane per session + поглощение busy-poll/preserve/flushPromise + kill-switch + RED→GREEN по nested-execute/deadlock.
- Доказано: git-proof, diffstat, прогоны (save-зоны 526/527 с 1 pre-existing; полный сьют 0 новых падений vs origin/main).
- Не закрыто (по плану, другие срезы): миграция самих путей записи, метрика 18→1+1 финал, e2e save-сценарии (S8).
