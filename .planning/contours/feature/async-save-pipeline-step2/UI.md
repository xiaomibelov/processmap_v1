# UI.md — feature/async-save-pipeline-step2 (frontend-контракт)

> Дата: 2026-09-16. PLAN.md — источник scope. Все пути от `frontend/src/`.

## 1. Модульная карта (новые файлы)

```
features/process/bpmn/save/opsOutbox/persistence/
  idb.js                    # тонкий IDB helper: openDb(dbName, version, upgrade), tx-store get/put/del/getAllByIndex, микро-очередь записей
  opsJournal.js             # журнал ops: appendOps(sessionId, ops), removeOps(opIds), hydrateBuffer(sessionId), proposed-store: putProposed/listProposed/resolveProposed
  syncStateStore.js         # getSyncState(sessionId), patchSyncState(sessionId, patch) — lastServerVersion, lastLocalVersion
  reconciliation.js         # политика «кто новее» (PLAN §5): resolveOnEntry({sessionId, serverVersion, hydrate, fetchServerXml, rebase, flush})
```

Стиль — как существующие raw-IDB потребители (`bpmnPacks.js`, `bpmnSnapshots.js`): никаких новых npm-зависимостей.

Схема БД `pm-save-outbox`:
- v1: store `operations` (keyPath `opId`; indexes `bySession (sessionId)`, `bySessionTs ([sessionId, ts])`), store `syncState` (keyPath `sessionId`).
- v2 (в этом же контуре): store `proposed` (keyPath `proposedId`; index `bySession (sessionId)`) — проигравшие LWW ops. Миграция через `upgrade` с `oldVersion` ветвлением.

IDB unavailable/denied → persistence-адаптер возвращает noop-реализацию (in-memory fallback), outbox работает как step1, без durable-гарантии. Не блокер, индикатор без изменений.

## 2. Жизненный цикл outbox (изменения `createSaveOutbox.js`)

1. `pushCommand` → op append в `buffer` **и** `opsJournal.appendOps` (~1 ms, микро-очередь, не блокирует) → UI-событие «сохранено локально». `lastLocalVersion` инкремент в `syncStateStore` (debounced).
2. **pendingAck-детач** (наследие п.1): на диспетчеризации `sent = buffer.splice(0)` — отправленный список живёт отдельно от буфера; undo/push во время полёта мутаируют только буфер; ack снимает `sent` целиком; nack/409 — возврат `sent` в голову буфера (перед новыми) с сохранением opId. Та же механика для `fullSavePreserveFrom` (sentinel по opId, не по индексу).
3. Ack 200 → `opsJournal.removeOps(sent.opIds)` + `syncStateStore.patch({lastServerVersion: ack.version})` → UI «синхронизировано».
4. **Version-based reconciliation manual full-save** (наследие п.5): ack full-save (не outbox-initiated) → снять из буфера/journal только если `ack.version >= baseVersion + sentCount` (подтверждено, что сервер видел все ops до и во время сохранения); иначе ops остаются и уходят следующим flush (идемпотентность opId).
5. Наследие п.3: удалить `isWithinKeepaliveBudget`, `keepaliveBodyLimitBytes`, `pageHideDrainTimeoutMs` и их тесты/упоминания.
6. Наследие п.6 (`commandToOps.js`): `connection.reconnect`/`reconnectStart`/`reconnectEnd` → нормализация в одну op `connection.reconnect` (`{connectionId, source, target}`); `shape.create`/`connection.create` — проброс клиентского `id` в payload. Create-op replay при 409: безопасен (сервер сохраняет id) — fallback `needsFullSave` для create-replay убрать, replay create через тот же `commandStack.execute`-путь с `__pmOpSource:"replay"`.

## 3. Фоновый sync и сеть

- Транспорт — существующий pipeline `"ops"` в `saveCoordinator`; flush-триггеры step1 сохранены (debounce 2.5 s / 50 ops / visibilitychange / pagehide+keepalive-fetch).
- **Online-триггер**: `window` `online` → немедленный `flushNow({reason:"online"})`; `offline` → индикатор «ожидает сеть», flush'и suppressed (не штатные ошибки). `navigator.onLine===false` → flush не стартует.
- **Retry к контракту F1**: параметры ops-пайплайна — base 1 s, factor 2, **cap 8 s, jitter ±30%, retryCount 3**. Бэкоф координатора (`saveCoordinator.js:662`) параметризуется (jitter/cap — опции pipeline-конфигурации, поведение pipeline `xml`/`meta` не меняется).
- Web Worker не вводится (обоснование PLAN §8.2).

## 4. ops_committed-consumer (мультипользовательская конвергенция)

- Расширение `hooks/useSessionEvents.js`: подписка на `ops_committed` (рядом с `session_deleted`), callback-регистрация из wiring.
- Обработка (wiring-слой, рядом с `bpmnWiring.js` fan-out):
  1. `actor_client_id === ownClientId` или все opId ∈ journal.acked → игнор.
  2. `version <= seenServerVersion` → игнор (устаревшее/дубликат).
  3. `full === true` → fetch `GET /bpmn` + rebase pendingOps поверх (ветка §5.3 PLAN).
  4. Иначе apply incoming ops к live-модели через `bpmn/ops/applyOps`-совместимый путь с `__pmOpSource:"remote"` (echo-suppression существует) → **LWW-детект**: пересечение по `elementId` между incoming и текущими pendingOps → проигравшие pending-ops вырезаются из буфера/journal и уходят в `proposed` (toast «{user} изменил элемент, ваши правки в предложенных» — не нативный диалог, AGENTS.md §6) → rebase оставшихся pendingOps поверх обновлённой модели → `flushNow`.
  5. Неприменимость remote-ops (fuzzy-fail) → консервативный fetch+rebase (тот же путь, что п.3).
  6. `seenServerVersion = event.version` (tracker + crossTabVersionSync publish).
- Нет 409-лупа: входящие версии монотонны; собственный stale-flush решается существующим 409-rebase.

## 5. «Предложенные изменения» (панель)

- Компонент рядом со stage UI: список `proposed`-записей (elementId, тип правки, время, автор-конфликта если известен). Действия: «Применить» (op возвращается в буфер как новая op с новым opId и уходит обычным flush), «Отклонить» (удаление записи). Пустое состояние — панель скрыта.
- Badge/counter в toolbar при непустом списке. Всё inline/toast — без `alert/confirm/prompt`.

## 6. Индикатор (двухсостоянийный)

`saveStatusSlotModel.js` — расширение `OPS_STAGE_VIEW` + sublabel-паттерн (`subprocessesSyncLabel`):

- `ops-local` (новый): «Сохранено локально», sublabel «ожидает сеть» при `offline`/flush-error — буфер durable в IDB.
- `ops-saving` / `ops-rebase` / `ops-degraded` — как step1.
- `ops-saved`: «Сохранено» (ack, journal drained).
- Прецедент сохраняется: debounced emit ≥300 ms, `data-state` атрибут, testid `diagram-toolbar-save-status-slot`.

## 7. Soft-lock UI

- `useSessionPresence.js`: touch дополняется `editingElementId` (выбранный элемент в modeler, снятие при blur/выходе; heartbeat ~15 s).
- Отображение: badge «{displayName} редактирует этот элемент» на элементе (overlay-паттерн существующих overlays) + маркер в presence-панели. Advisory: ничего не блокирует.

## 8. Вход в сессию (reconciliation hook)

`app/useSessionActivationOrchestration.js` `openSession`: после `apiGetSession`, до snapshot-reconcile — `reconciliation.resolveOnEntry(...)`: гидрация `syncState` + pending buffer из journal; ветки PLAN §5 (чистый / догон дельтами / fetch+rebase / консервативный). При fetch+rebase загрузка через существующий bpmn-load путь с echo-mute. Snapshot-reconcile step1 выполняется после и не отменяется.

## 9. Coverage-контракт

`__PM_OPS_COVERAGE__` ≥0.95 на расширенном e2e-корпусе (async-save spec + multi-user spec + canvas-heavy-editing + canvas-editing-stability). Расширение vocabulary (reconnect) должно **не снижать** mapped/total на существующих сценариях.

## 10. Что НЕ меняется

- Пайплайны `xml`/`rawXml`/`meta` координатора (кроме параметризации бэкофа — опционально, без изменения их чисел).
- Conflict gate + `ProcessStageSaveConflictModal` (cross-tab) — по-прежнему вне контура.
- Экспорт/XML-вкладка — полный XML.
- Dedup-автосейва, drag coalesce (400 мс), mouseup-commit.
