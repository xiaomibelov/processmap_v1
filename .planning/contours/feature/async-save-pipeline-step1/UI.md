# UI.md — фронтенд: SaveOutbox (deltas)

Baseline: `origin/main` @ `b8285741`. Принцип: **новый конвейер поверх существующей инфраструктуры, а не рядом с ней** (единая реализация, правило дедупликации).

## 1. Модульная карта (новые файлы)

```
frontend/src/features/process/bpmn/save/opsOutbox/
├── commandToOps.js            # маппинг commandStack.command → op[] (whitelist)
├── opsBatchSerializer.js      # сборка body {baseVersion, operations}, coalesce move-штормов
├── createSaveOutbox.js        # накопитель: subscribe → buffer → debounce/threshold → flush
├── opsRebase.js               # 409-rebase: adopt currentXml + replay через bpmn/ops/applyOps
└── opsOutboxConfig.js         # flushDebounceMs:2500, maxOpsPerFlush:50, coalesceMs:400 (окно 300–500), mouseupCommit, keepalive таймауты
frontend/src/features/session/saveCoordinator.js        # + pipeline "ops" (регистрация, без переписывания)
frontend/src/features/process/stage/ui/                 # + outbox-состояния в saveStatusSlotModel
```

Тесты рядом: `*.test.mjs` (node:test, стиль соседних `save/saveStatusEmitDebounce.test.mjs`).

## 2. Интеграционные точки (существующий код, не трогаем по поведению)

- **Источник событий:** подписка `commandStack.changed` уже есть — `createBpmnRuntime.js:201` (приоритет 1000). Outbox подписывается на тот же поток через существующий `onRuntimeChange`-каскад (`bpmnWiring.js:242-268`), отдельной подписки на bpmn-js не создаём (двойные подписки = расхождение).
- **Очередь/ретраи/abort/conflict gate:** pipeline `"ops"` в `saveCoordinator.js` (тот же контракт, что `"xml"`/`"meta"`: `getBaseVersion`/`applyBaseVersion`/`onSuccess`/`on409`, retry 3/backoff, transport timeout).
- **Single writer:** flush outbox и flush full-save взаимно исключаются через saveCoordinator per-session promise queue. Outbox не пишет, пока full-save в полёте, и наоборот.
- **CAS:** `casVersionTracker` + `casResponse.js` (`resolveBaseVersionAtSendTime`, `readAckDiagramStateVersion`) — единственный источник версий; своих трекеров не создаём.
- **Индикатор:** `useSaveUploadLifecycle` + `DiagramToolbarSaveStatusSlot` (`saveStatusSlotModel.js`) — добавляем стадии `ops-saving` / `ops-degraded` / `ops-rebase` к существующим saving/saved/dirty/conflict/failed; debounced emit уже есть.
- **Lifecycle flush:** `useAutosaveQueue.js:102-119` и `BpmnStage.jsx:5510-5560` уже делают flush на `visibilitychange`/`beforeunload` — outbox подключается как дополнительный callback в тот же хук, без второго набора слушателей.
- **E2E-хуки:** рядом с `window.__FPC_E2E_PAUSE_AUTOSAVE__` добавляем `window.__PM_OPS_FLUSHED__` (счётчик/трассировка ops-флашей) — для e2e-ассёртов «ни одного full PUT».

## 3. Поток данных

```
commandStack.changed (runtime, существующий)
  → bpmnWiring.onRuntimeChange (существующий)
    → SaveOutbox.push(command)
        ├─ whitelisted → op[] → buffer (opId=uuid, coalesce по elementId+type)
        └─ не whitelisted → mark "needsFullSave" (текущий flush-полный путь)
  flush-триггеры:
    ├─ debounce 2.5 s с последней op
    ├─ buffer >= 50 ops
    ├─ visibilitychange → hidden
    └─ beforeunload / pagehide
  flush:
    → saveCoordinator.enqueue("ops") → apiPostSessionOperations
    → 200: bump casVersionTracker, buffer=acked, индикатор "сохранено"
    → 409: opsRebase (§5)
    → сеть/5xx: retry/backoff (существующий), далее ops-degraded (§6)
```

**Optimistic UI:** правка применяется commandStack синхронно (уже так). Outbox только индикатор: «сохраняется…» сразу после первой op, «сохранено» после ack; конфликт/rebase показываем отдельной стадией, без модала (same-tab race — автоматический).

## 4. Маппинг command → op (whitelist step1)

Источник истины по именам команд — `commandStack.changed` payload (`command`/`commandStack._stack` top, `createBpmnRuntime.js:170-211`).

| Команда bpmn-js | op(s) | Примечание |
|---|---|---|
| `element.updateProperties` | `element.updateProperties` | rename и пр. plain attrs |
| `shape.move` | `shape.move` (coalesce: keep-last по elementId за окно буфера) | drag-шторм → 1 op |
| `shape.resize` | `shape.resize` | keep-last |
| `connection.updateWaypoints` / label move | `element.updateDi` | DI-only |
| `shape.create` / `connection.create` | `shape.create` / `connection.create` | полный descriptor (type, bounds, source/target, waypoints) |
| `shape.delete` / `connection.delete` | `shape.delete` / `connection.delete` | |
| undo/redo (`commandStack.changed` re-fire) | та же сериализация | undo удаляет op из буфера, если она ещё не ушла; ушедшие undo'ы уходят как новая compensating-op через тот же маппинг |

Вне whitelist (step1): `connection.reconnect*` (обоснованный fallback — PLAN §3.1: сложная валидация source/target, низкая частота), `spaceTool`, `lane.*` resize-композиты, `canvas.updateRoot`, подпроцесс-структурные команды, paste мульти-элементный → `needsFullSave`. Доля таких команд мала в типовом редактировании; каждая просто переводит текущий flush на существующий полный путь. Замер доли — coverage-метрика ≥95% (PLAN §3.1, счётчик `window.__PM_OPS_COVERAGE__`).

### 4.1 Mutation gateway и echo suppression

Все production-мутации диаграммы идут через bpmn-js `modeling`-API → `commandStack` (подтверждено grep'ом baseline: context-menu `modeling.updateProperties/createShape/connect`, editor actions; прямые `businessObject.*`-записи — только в тестах). Outbox наблюдает единственную точку входа; сайдбар, хоткеи, AI-права автоматически покрываются vocabulary, если идут через `modeling`.

**Echo suppression контракт:** replay rebase (§5) применяет ops через `applyOps` с пометкой контекста команд `__pmOpId` + `__pmOpSource: "replay"`; `commandToOps` пропускает такие команды — ни одна replay-команда не становится op, оп-дубликатов не возникает. Поле `source` (`user|agent|e2e|replay`) уходит в body запроса и хранится сервером.

## 5. Rebase при 409 (same-tab race)

1. `opsOutbox` → стадия `ops-rebase`, буфер замораживается (новые ops — в staging).
2. Из 409-body: `casVersionTracker.adopt(server_current_version)` + публикация через `crossTabVersionSync` (как в same-tab auto-resolve `ProcessStage.jsx:1604-1650`).
3. `currentXml` загружается в modeler через существующий reload-путь (тот, что использует auto-resolve конфликта), **без потери неподтверждённых правок** — они у нас в буфере/staging.
4. `opsRebase.replay(pendingOps)`: применение op-листа к live modeler через существующий `features/process/bpmn/ops/applyOps.js` (proven-путь AI edit plans; fuzzy resolution по id). Применённые команды проходят через `commandStack.changed` → попадают обратно в outbox-staging → **но opId сохраняются**, чтобы повторный flush не задублировал (сервер идемпотентен по opId — двойная доставка безопасна).
5. Resume: обычный flush; если replay применил op с fuzzy-match (element не найден по id) → `needsFullSave`.
6. Undo/redo-native rebase (undo local stack → adopt → redo) — исследование; не блокер (PLAN §6.4).

## 6. Деградация (fallback, не удаление)

- 422 / двойной 409 / transport fail после retry → сессия → `ops-degraded` до reload страницы: всё сохранение идёт существующим full-save путём, индикатор показывает degraded-подпись. Никаких авто-reload.
- Full save ack (manual, tab-switch, beforeunload при недоступном ops) → outbox сбрасывается: серверное состояние покрывает все локальные ops.
- Экспорт, XML-вкладка, subprocess re-embed — полный XML, как сейчас (критерий приёмки).

## 7. Flush при уходе со страницы — fetch keepalive вместо sendBeacon

- Миссия предполагает `sendBeacon`; **реализация — `fetch(url, {method:"POST", keepalive:true, headers:{Authorization...}})`**: sendBeacon не поддерживает кастомные заголовки, а API требует JWT bearer. `keepalive` даёт тот же best-effort семантик при unload с сохранением заголовков и тела.
- Ограничение keepalive (~64 kB): батч ops ≤ ~10 kB, укладываемся с запасом; если буфер больше — сначала пробуем обычный fetch с коротким таймаутом, keepalive — best-effort хвост.
- Ответ уходящей странице не нужен: fire-and-forget, серверная идемпотентность по opId закрывает двойную доставку (unload-flush + восстановленная страница).

## 8. Бюджеты и регрессионные инварианты

- Батч ≤ 10 kB (e2e-ассерт на размер тела).
- `window.__PM_DIFF_CALLS__` бюджет (≤1 saveXML на правку) — не ломаем: outbox не вызывает `getXml()` вовсе; `savedHash` skip-if-unchanged (`createBpmnCoordinator.js:534-561`) продолжает работать для full-save пути.
- Property-* действия и `publish_manual_save` bypass — не трогаем (#924): они не попадают в outbox.
- Ни одного нативного `alert/confirm/prompt` (AGENTS.md §6).
