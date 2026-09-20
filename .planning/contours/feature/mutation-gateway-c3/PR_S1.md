# PR — S1: per-session mutation lane (gateway-core)

> Контур: `feature/mutation-gateway-c3`, срез S1 (PLAN.md §7). Backend не меняется (frontend-only).
> **Merge/deploy/PR — только по explicit approve владельца.**

## Что

Per-session mutation lane в `saveCoordinator`: не более одного in-flight diagram-truth mutation-запроса на сессию across pipelines (ops/rawXml/xml) и зарегистрированных прямых PUT. Поглощены ad-hoc взаимные исключения save-пути:

- **outbox busy-poll 200 мс** (`createSaveOutbox.js`) → детерминированный resume через FIFO-очередь lane (lane-release вместо таймера);
- **пара sentinel'ов** `fullSavePreserve` + `manualSaveCoveredOpIds` → единый covered-снимок opId буфера (снимок на делегирование / на build ручного full-save, drain пересечения по ack);
- **coordinator `flushPromise` сериализация** (`createBpmnCoordinator.js`) → `flushSave`/`persistExplicitXml` исполняются как task общей lane; triangulation удалена;
- **прямые PUT** (6 точек: `ProcessStage.jsx` ×4, `App.jsx` tobe_publish, `useSessionActivationOrchestration.js` snapshot restore) зарегистрированы как lane-участники через `gatewayPutBpmnXml` (предшественник `gateway.putSystem`, PLAN §6).

**Не тронуто**: meta/analysis пайплайны (`mutationLane:false` — per-pipeline очереди, disjoint-key семантика и C2 silent-rebase контракт сохранены); conflict gate (armed gate отсекает до lane, `gate_block` результаты сохраняются); порядок 409-ветки и `trySilentRebase` hook; `casVersionTracker` base-at-send-time; `beginSingleWriter/endSingleWriter` (`template_apply`) — ортогональная семантика single-writer.

## Почему

Аудит save-пути (A5-map, 18 путей/13 таймеров/9 degrade-веток): взаимное исключение mutation-запросов сессии собиралось из трёх ad-hoc механизмов (poll, sentinel'ы, flushPromise), каждый — точка drift'а и latency (200 мс poll на каждый ops-flush за full-save). Lane даёт одну точку знания о in-flight мутации и единую FIFO-сериализацию. Минус-код: net −84 строки по save-ядру при новом модуле lane.

**Ключевой инвариант дизайна**: lane на уровне mutation-intent (прогон пайплайна), не вызова `execute`. Вложенный xml→rawXml той же execution-chain проходит lane **inline по явному токену chain** (transport 4-й аргумент → `options.laneContext` → `payload.mutationLaneContext`); внешний вызов без токена всегда очередь. Temporal-эвристика отвергнута: неотличима от внешнего вызова (поймано RED-тестами на первой итерации).

## Метрика «пути записи до/после» (18 → 1+1) — промежуточное состояние

S1 меняет **механизм сериализации**, не сами пути. Поглощено: busy-poll, preserve-sentinel'ы, flushPromise. Запись по-прежнему идёт прежними путями, но единой lane. До целевого 1+1 остаётся (срезы S2–S6): full-save arm positional-ветки (S2), ops degrade → full-PUT (S6 за `fpc_gateway_cold_fallback`), аудит оставшихся прямых PUT (S6). Cold-канал системных действий (manual save, import, template, restore, tobe_publish и пр.) перманентен по §9 PLAN.

## Дата смерти

**`fpc_gateway_cold_fallback` = 2026-10-03** (последний день существования; после даты флаг и вытеснённые fallback-ветки удаляются, либо эскалация владельцу). Новый kill-switch среза: **`fpc_gateway_lane`** (default ON; `0/off/false` = pass-through) — рововый выключатель, при OFF взаимное исключение отсутствует (единственный поддерживаемый режим — lane-on).

## Тест-матрица (vitest/node --test)

| Группа | Что покрыто | Результат |
|---|---|---|
| `saveCoordinator.gatewayLane.test.mjs` (новый, 7 тестов) | сериализация cross-pipeline per session; независимость сессий; meta bypass (`mutationLane:false`); вложенный execute без deadlock (explicit token); armed gate respected (gate_block без transport); kill-switch OFF = pass-through | зелёные |
| `saveCoordinator.nested-execute.test.mjs` (адаптирован) | вложенный execute → explicit-ctx контракт | зелёный |
| `saveCoordinator.test.mjs` (адаптирован) | «independent pipelines…» → «serialize through the gateway lane» (смена контракта зафиксирована) | зелёный |
| `createSaveOutbox.test.mjs` (адаптирован +1 новый) | mutual-exclusion без poll; **детерминированный resume** (`flushNow` резолвится только после фактической отправки) | зелёные |
| `saveCoordinator.abort-signal-wiring.test.mjs` (адаптирован) | source-level: transport 4-й аргумент, signal остаётся 3-м | зелёный |
| characterization-набор среза | saveCoordinator.* (8 файлов), createSaveOutbox.* (5), createBpmnCoordinator.* (14), persistence, sessionPatchCasCoordinator, process/save | зелёные (кроме 1 pre-existing, см. ниже) |

Числа: save-зоны **526/527** (+26 тестов vs baseline 501: новые тесты среза); полный frontend-сьют **3975 тестов, 0 новых падений vs origin/main** (baseline 3968/76 fail, S1 3975/76 fail — множества падений идентичны: version-drift `appVersion`, i18n, dark-theme, technologist/UI — tech debt main).

Pre-existing (не среза): `saveBpmnState.property-pipeline :: property save returns error when coordinator transport hangs` — падает на чистом origin/main (transportTimeoutMs 60с vs hang 12с в тесте); рекомендован отдельный мини-фикс.

## Rollback

1. Revert коммитов среза S1 (`git revert <хеши>` / откат ветки до `625359ab`).
2. Оперативный kill-switch без реверта: `localStorage.fpc_gateway_lane = "0"` (pass-through; ad-hoc механизмы не восстанавливаются — lane-on единственный поддерживаемый режим).

## Риски

- R-1 deadlock: закрыт explicit-token дизайном + 4 тестами; temporal-эвристика отвергнута с записью причины в EXEC_REPORT.
- Тайминговая чувствительность lane-кодов в jsdom/node окружении: прогоны повторены 3×, стабильно.
- При OFF kill-switch'а взаимное исключение ops↔full-save отсутствует — флаг только для аварийного отката.
