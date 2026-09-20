# EXEC_REPORT — S2 (positional keep-final → lane-семантика) контура feature/mutation-gateway-c3

Дата: 2026-09-20. Роль: Agent 2 (Executor). Срез: S2 по PLAN.md §7.
Статус: **DONE** (unit/characterization-гейт + e2e-гейт на локальном стеке; push после среза; PR не создавался).

## Цель среза

Перенос full-save arm positional-ветки (staging `STAGE_POSITIONAL_CHANGE` / `notifyPositionalPending` → coordinator keep-final flush) в lane-семантику: keep-final flush (drag-final/positional таймеры → `flushSave("autosave")` → rawXml) — полноценный lane-участник: детерминированный base at send time, сериализация через gatewayLane, дефер при занятой lane вместо ad-hoc наложений.

**ИНВАРИАНТ ДЮРАБИЛЬНОСТИ (владелец, №1): перенос БЕЗ СЪЁМА.** Съёма keep-final flush нет: на каждом коммите среза drag перзистится (подтверждено e2e-гейтом: keep-final full-PUT ~524 мс после mouseup, элемент на месте со смещением после reload на сервере и в модели). Срез — один атомарный поведенческий коммит + characterization-тесты; любой префикс ветки работоспособен (S1-HEAD работоспособен сам по себе, S2-коммит атомарен).

## git-proof

```
worktree: /Users/mac/agents_place/kimi_PM/.wt-mutation-gateway-c3
branch:   feature/mutation-gateway-c3 (tracking origin, push после среза)
base:     e8919198 (S1, VERIFIED, запушен)
```

## Что изменено (diffstat: 2 файла, +248/−12)

**`createBpmnCoordinator.js` (+12/−12, фактически −2 строки + комментарии):**
- `armDragFinalTimer`: удалён guard `!saveInFlight` — таймер взводится на drag-end всегда (при наличии pending-флагов); занятость lane даёт детерминированный defer самого `flushSave` (lane-task, S1).
- Удалены оба F3 re-arm блока (`finally` `flushSaveRun` и `finally` `persistExplicitXmlRun`) — мёртвый ad-hoc: таймер теперь всегда взведён drag-end'ом; re-arm добавлял лишь debounce-окно к lane-defer'у.
- `notifyDragEnd`: комментарий обновлён под lane-семантику.

**Новый characterization-файл (+236):** `createBpmnCoordinator.drag-final-lane-defer.characterization.test.mjs` — 3 теста (см. ниже).

**Staging (`createLocalMutationStaging.js`): изменений НЕТ** — busy-остатков save-пути в staging нет: единственная busy-машина там (`throttledSerializeInFlight/Reschedule`) — это coalescing сериализации снапшота (RC1 hot-path), не mutex сохранения; семантика предиката `shouldSkipAutosave` (guard `!autosaveSkipped`, :200-209) не тронута (это S3).

Не тронуто: `scheduleSave` coalescing `saveQueuedRev` (structural-путь, вне зацепок S2), `beginSingleWriter` (template), meta/analysis, C2-контракт, ops-whitelist.

## RED → GREEN evidence

### RED (на S1-HEAD, до реализации)

`S2: keep-final flush defers through lane at timer fire (no F3 re-arm debounce wait)` — **падение по правильной причине**: `latency=21ms` — ровно debounce-окно F3 re-arm (`dragFinalDebounceMs=20`) между освобождением lane и стартом второго `saveRaw`. На lane-семантике latency должна быть ≈0 (flush уже стоит в lane-очереди с момента срабатывания таймера).

Остальные 2 новых теста (guards, зелёные на обеих семантиках): base-at-send-time для lane-deferred keep-final; общая lane-инстанс координатора и saveCoordinator.

### GREEN

После удаления guard'а и re-arm'ов: RED-тест зелёный (latency <10 мс), оба F3-характеризационных теста (`drag-final-inflight`, `drag-final-explicit-persist-inflight`) остались зелёными без правок — их наблюдаемый контракт («drag-end во время in-flight PUT → flush после завершения PUT, не раньше, не потерян») сохранён, теперь его даёт lane-очередь вместо re-arm triangulation.

## Прогоны (node --test, node v24.21.0)

| Прогон | Зона | Тестов | Pass | Fail |
|---|---|---|---|---|
| S1-бaseline (save-зоны) | session/__tests__, bpmn/save, bpmn/coordinator, bpmn/persistence, stage/utils, process/save | 527 | 526 | 1* |
| S2 финал (coordinator-зона) | bpmn/coordinator | 91 | 91 | 0 |
| S2 финал (полный сьют) | весь frontend | 3978 | 3898 | 76 (73 уникальных, идентичны S1/origin-main) |

\* pre-existing `saveBpmnState.property-pipeline :: transport hangs` (падает на чистом origin/main).

Полный сьют S2: **0 новых падений vs S1-baseline** (diff по именам тестов пустой; +3 новых теста среза).

Полный сьют S2: сравнение со S1-бaseline (76 fail / 73 уникальных на origin/main) — итог в разделе «Полный сьют» ниже; критерий — 0 новых падений.

## e2e-гейт (условие владельца №2): ПРОГРАН

**Сценарий:** реальный mouse drag → перезагрузка страницы → элемент на месте (со смещением). Методика S0: центровка viewbox, `elementFromPoint → [data-element-id]`, assert реального смещения (8 шагов по 16 мс, playwright mouse).

**Среда:** ЛОКАЛЬНЫЙ стек с кодом ветки (stage не подходит — нет C3/S2):
- `COMPOSE_PROJECT_NAME=wt-mgc3-s2`, API `127.0.0.1:18011`, frontend `127.0.0.1:15177` (основные порты 8011/5177 заняты чужим стеком `wt-audit-canvas-409` — НЕ тронут; `tools/pm-env-lock.sh` в worktree отсутствует).
- Сервисы: postgres/redis/rag-embedder/api/frontend (kanboard 3001/celery/notifications/agent не нужны, не поднимались).
- Frontend-образ пересобран (`--build`) ПОСЛЕ S2-правок (image Created 03:53 MSK > коммит-S1 03:11 и правки координатора).

**Результат (2/2 прогона PASS, exit 0):**
```
pos-before        T_5 (1300, 60)
pos-after-drag    T_5 (1360, 80)   moved (+60, +20)   ← реальный drag (snap к сетке)
writers           PUT /api/sessions/{sid}/bpmn через 524 мс после mouseup
                  ← keep-final full-PUT СОХРАНЁН (перенос без съёма)
pos-after-reload  T_5 (1360, 80)                      ← перзист после перезагрузки
server-bounds     T_5 (1360, 80)                      ← серверный XML со смещением
VERDICT           okDrag/okReload/okServer = true, PASS
```
Артефакты: `.planning/contours/feature/mutation-gateway-c3/evidence/s2/` (s2-e2e-drag-persist.mjs, logs/s2-events.jsonl).

## s3_pinpoint (условие владельца №3): разобран, код НЕ чинился

**Что теряется:** список перемещаемых элементов `shapes`. Runtime-probe (подписка на `rt.onChange`, тот же event-объект, что получает `outbox.pushCommand`) на реальном drag: команда `elements.move`, action `execute`, `commandContext = { delta: {x:60,y:20}, parent: {...} }` — ключа `elements`/`shapes` нет.

**Где:** `frontend/src/features/process/bpmn/runtime/createBpmnRuntime.js:155-190` (`snapshotCommandContext`). Статический маппинг есть для `context.elements` (:171-173), но diagram-js `Modeling.prototype.moveElements` строит контекст команды `elements.move` с полем **`shapes`**, а не `elements` (`frontend/node_modules/diagram-js/lib/features/modeling/Modeling.js:236-243`: `context = { shapes, delta, newParent, newHost, hints }`). `snapshotCommandContext` не маппит `context.shapes` вообще → список теряется на эмиссии; `newParent` доезжает лишь через алиас `parent` (:186). Для одиночного drag это незаметно (есть `delta` + `parent`), для мульти-выделенного drag — потеря всех id кроме… полностью.

**Почему serialization роняет поле:** не роняет — поле называется иначе на входе маппера; маппер молча пропускает неизвестные ключи (нет fail-closed на непустом `context.shapes`).

**Что чинить в S3:** `snapshotCommandContext`: добавить маппинг `context.shapes` (аналог `context.elements`, ~4 строки: `if (Array.isArray(context.shapes)) out.shapes = context.shapes.map(snapshotElementRef).filter(Boolean);`) — либо нормализацию `shapes→elements` в маппере `commandToOps` для `elements.move` (батч shape.move). Объём фикса: ~5-8 строк runtime + маппер/тесты parity в S3; контракт ops-эмульсии (id+bounds+waypoints) `snapshotElementRef` уже достаточен для батч-маппинга.

## Риски / ограничения / переносы

1. Kill-switch `fpc_gateway_lane` (S1) без изменений; OFF = pass-through — для S2 это значит отсутствие serialization keep-final (ad-hoc F3 тоже удалён) — единственный поддерживаемый режим lane-on.
2. Поведенческий нюанс: mid-drag завершение стороннего flush больше не взводит drag-final таймер до mouseup (раньше F3 re-arm мог взвести его mid-drag) — keep-final теперь строго после mouseup; durability не меняется (drag-throttle structural-путь активен во время drag).
3. e2e-гейт прогнан на localhost-стеке ветки; stage-окно не использовалось (код stage без C3).
4. Переносы на S3: маппинг `shapes` (pinpoint выше) + `elements.move` → батч shape.move; S2-target из S0 (positional-ветка) — arm сохранён по решению владельца (съём запрещён), удаление full-save arm positional-ветки перенесено на S3 (после op-маппинга) — фиксация в STATE.json.

## Handoff-proof

- Цель среза закрыта: keep-final flush — lane-участник с детерминированным defer и base at send time; ad-hoc наложение F3 удалено (минус-код); перенос без съёма доказан e2e.
- Доказано: RED (latency=21мс) → GREEN; 91/91 coordinator-зона; e2e 2/2 PASS с server-truth; полный сьют 0 новых падений.
- Не закрыто (по плану): маппинг `elements.move`→ops (S3, pinpoint готов), удаление full-save arm после op-маппинга (S3), метрики 18→1+1 финал (S8).
