# PR — S2: positional keep-final flush → lane-семантика координатора

> Контур: `feature/mutation-gateway-c3`, срез S2 (PLAN.md §7). Frontend-only. Base: S1 (`e8919198`, VERIFIED).
> **Перенос без съёма**: keep-final flush (drag → full-PUT) сохранён как канал перзиста positional-изменений; e2e-гейт подтверждает drag → reload → элемент на месте со смещением (server truth).
> Merge/PR — только по explicit approve владельца.

## Что

Keep-final positional flush переведён из ad-hoc наложения в lane-семантику S1:

- `armDragFinalTimer` больше не откладывает взвод таймера при `saveInFlight` — drag-final таймер взводится на drag-end всегда; занятость lane даёт **детерминированный defer**: `flushSave` исполняется как task mutation lane и стартует сразу по освобождению (base читается из `casVersionTracker` в момент фактической отправки — rawXml pipeline getBaseVersion, S1-контракт).
- Удалена F3 triangulation: re-arm `armDragFinalTimer()` в `finally` `flushSave` и `finally` `persistExplicitXml` (мёртвый код после снятия guard'а — ранье давал лишнее debounce-окно поверх lane-defer'а).
- Standalone positional-таймер (`notePositionalChange`) — уже lane-дефер (S1), изменений не потребовалось.
- Staging (`createLocalMutationStaging.js`): busy-остатков save-пути нет (throttled-serialization — coalescing снапшота, не mutex); предикат `shouldSkipAutosave` не тронут (S3).

## Почему

F3 («guard saveInFlight + re-arm в finally») был точечным фиксом canvas-save-hot-path-v1 за потерянный drag-end flush. После S1 единая FIFO lane даёт ту же гарантию детерминированно и без второго таймерного наложения: flush ставится в очередь в момент срабатывания drag-final таймера и исполняется сразу по освобождению lane. Минус-код: −2 строки + удалённое debounce-окно на горячем пути drag (keep-final PUT стартует на ~20 мс раньше при in-flight соседнем save).

## e2e-гейт среза (локальный стек ветки, 2/2 PASS)

`evidence/s2/s2-e2e-drag-persist.mjs`: fixture 24 задачи → центровка viewbox → `elementFromPoint` хит-тест `T_5` → реальный mouse drag (8 шагов) → keep-final `PUT /api/sessions/{sid}/bpmn` через 524 мс после mouseup → reload → модель (1360,80) = серверный XML (1360,80), смещение (+60,+20) сохранено. Методика S0; stage не использовался (код stage без C3).

## s3_pinpoint (без фикса)

Runtime-probe на реальном drag: `elements.move` → `commandContext = {delta, parent}` — **список `shapes` теряется**. Причина: diagram-js `Modeling.moveElements` кладёт в контекст `shapes`, а `snapshotCommandContext` (`createBpmnRuntime.js:155-190`) маппит только `elements` — поле `shapes` молча пропускается. Фикс в S3: маппинг `context.shapes` (~4-8 строк runtime) + маппер `elements.move` → батч `shape.move` в `commandToOps`. Подробности: EXEC_REPORT_S2.md §s3_pinpoint.

## Метрика «пути записи до/после» (18 → 1+1) — честное состояние после S2

S1 дал единый механизм сериализации (lane), S2 перевёл keep-final positional flush в неё и удалил ad-hoc наложение. Сами пути записи не изменились: drag → keep-final full-PUT (positional arm сохранён по решению владельца, съём запрещён); ops-путь для whitelisted-команд. До 1+1 остаётся (S3–S6): `elements.move`→ops-маппинг (S3, pinpoint готов), после которого full-save arm positional-ветки удаляется; degrade→full-PUT (S6, за `fpc_gateway_cold_fallback`); аудит оставшихся прямых PUT (S6).

## Дата смерти

**`fpc_gateway_cold_fallback` = 2026-10-03** (последний день; после даты флаг и fallback-ветки удаляются либо эскалация владельцу). Kill-switch среза S1 `fpc_gateway_lane` (default ON) без изменений.

## Тест-матрица

| Тест | Что | Результат |
|---|---|---|
| `drag-final-lane-defer.characterization` (новый, 3 теста) | lane-defer в момент срабатывания таймера (RED: latency=21 мс на F3-re-arm) ; base-at-send-time после deferral ; общая lane координатора и saveCoordinator | зелёные |
| `drag-final-inflight` / `drag-final-explicit-persist-inflight` (characterization F3) | durability drag-end при in-flight PUT/property-persist — без правок, контракт теперь даёт lane | зелёные |
| coordinator-зона (все 91 тест) | drag/throttle/positional/single-writer/precedence/skip-unchanged и пр. | зелёные |
| Полный frontend-сьют | 3978 тестов | 0 новых падений vs S1-baseline (множество fail идентично: 73 pre-existing main) |

## Rollback

1. Revert коммита S2 (`git revert <hash>`) — F3 guard/re-arm возвращаются как были (конфликта с S1 нет: независимые строки).
2. Оперативно: `localStorage.fpc_gateway_lane="0"` (S1 kill-switch; ad-hoc механизмы не восстанавливаются).

## Риски

- Тайминговая чувствительность нового latency-теста: порог 10 мс vs фактические ~21 мс на старой семантике и ~0-2 мс на новой; прогоны стабильны (3×).
- Mid-drag взвод drag-final таймера сторонним flush больше не происходит (раньше мог через F3 re-arm) — keep-final строго после mouseup; durability не затронута.
