# TESTS.md — feature/async-save-pipeline-step2

> Дата: 2026-09-16. PLAN §9 — источник матрицы. TDD-дисклина: RED (failing test по правильной причине) → GREEN → REFACTOR. Никакого production-кода без падающего теста.

## 1. Frontend unit (`node --test`, хост `node v24`, `npm test` в `frontend/`)

### 1.1 Persistence (`persistence/`)
- `idb.js`: openDb + upgrade-ветвление v1→v2 (proposed); микро-очередь записей сохраняет порядок; мок IDB (in-memory, без новых депов) — helper в test-файле.
- `opsJournal.js`: appendOps/getAllBySession/removeOps(opIds)/hydrate order by `[sessionId, ts]`; proposed put/list/resolve.
- `syncStateStore.js`: get/patch, отсутствующая запись → null (не throw).
- Fallback: IDB unavailable → noop-адаптер, outbox работает (тест интеграционный через createSaveOutbox).

### 1.2 Outbox lifecycle (`createSaveOutbox.test.mjs` + новые)
- **RED-first наследие п.1**: push → flush(transport hang) → undo отправленной op → push → ack → вторая op уходит следующим flush'ем (sent-детач).
- **Наследие п.5**: manual full-save ack → ack.version ≥ base+sentCount ⇒ буфер снят; ack.version меньше ⇒ ops остаются и re-flush.
- Journal: append на push, removeOps ровно acked opIds на ack, hydrate восстанавливает буфер после «reload» (новый экземпляр outbox с тем же journal).
- Dead keepalive: grep-контракт — `isWithinKeepaliveBudget|keepaliveBodyLimitBytes|pageHideDrainTimeoutMs` отсутствуют в src (тест читает файлы).
- Backoff F1: ops-pipeline retry 1s→2s→4s→8s cap с jitter ±30% (мок таймеров/рандома), retryCount 3; xml-pipeline числа не изменились (регрессия).

### 1.3 commandToOps (`commandToOps.test.mjs`)
- `connection.reconnect`/`reconnectStart`/`reconnectEnd` → одна op `{connectionId, source, target}`; undo reconnect → compensating (не needsFullSave).
- create-ops несут клиентский `id` в payload.
- Coverage-счётчик: reconnect команды теперь mapped (fullSave-фолдов меньше), mapped/total на синтетической серии не падает.

### 1.4 Reconciliation (`persistence/reconciliation.test.mjs`)
- 4 ветки PLAN §5: чистый вход (нет local → noop); догон дельтами (serverVersion == lastServerVersion, pending есть → flush вызван без fetch); fetch+rebase (serverVersion > last → GET /bpmn + rebase + flush); serverVersion < last → консервативный fetch (лог телеметрии).
- Гидрация перед ветвлением (pending ops из journal попадают в буфер).

### 1.5 Consumer / LWW (`opsRemoteApply.test.mjs` — новый)
- own event (actor_clientId == own) → игнор; дубль по opId → игнор; version <= seen → игнор.
- incoming apply к модели (мок applyOps) с `__pmOpSource:"remote"`.
- LWW-детект: incoming op на тот же elementId, что pending → pending уходит в proposed, incoming побеждает, остальные pending ребазятся, flush вызван.
- `full:true` → fetch+rebase ветка.
- Неприменимость (fuzzy-fail) → fetch+rebase.

### 1.6 Indicator / soft-lock model
- `saveStatusSlotModel`: `ops-local` состояние + sublabel «ожидает сеть»; прецедент состояний не сломан.
- presence-model: `editingElementId` маппится в badge-текст «{name} редактирует этот элемент»; отсутствие — нет badge.

## 2. Backend unit (`pytest`, изолированное окружение)

### 2.1 ops_committed (новый `backend/tests/test_ops_committed_events.py`)
- apply ops → подписчик bus получает `ops_committed` с version/operations/actor_client_id/full=false.
- full save (PUT /bpmn) → событие `full:true`, operations=[].
- rollback батча → события нет.
- redis pub/sub fan-in: публикация в redis (fakeredis/`redis` в тест-зависимостях или интеграционный redis стека, НЕ мутируя стек) → подписчик через релей получает то же событие; redis down → publish не падает (ответ 200).
- автор, не ожидающий собственное событие: actor_client_id корректно заполнен из payload.

### 2.2 Наследие backend
- Route: ровно одна live-регистрация `/operations` (introspection `app.routes` — нет дублей); 200/409/422/423 матрица step1 проходит через router-путь.
- Org-regression: `_save_session_with_cas` conflict reload — `test_conflict_includes_server_xml_for_non_default_org`-паттерн (patch `push_storage_request_scope` dropping org) → XML в 409 для не-дефолтной org.
- Parent re-embed order: child CAS-409 → parent XML НЕ перезаписан (assert parent unchanged); happy path → parent synced после child commit; re-embed failure → child committed, `parent_synced=false`, 200.
- Applier reconnect: happy path (source/target rewritten, incoming/outgoing перелинкованы, DI-edge на месте); отсутствующий source → 422 + rollback; reconnect на element с участием participant — parity golden-тест.
- Create с клиентским id: элемент создан с данным id; replay create (тот же opId, second batch) → идемпотентно; коллизия id → 422.
- Presence: touch с `editingElementId` → в active_users; невалидный id-формат → 422; leave снимает.

### 2.3 Существующие наборы — без регрессий
- `test_session_operations_api.py` (36), `test_ops_applier_parity.py` (13) — зелёные.
- Полный backend pytest: зафиксировать дельту vs baseline `origin/main` (4 pre-existing `PROCESS_DB_PATH` красных — известны, не причём контура).

## 3. Spec/OpenAPI
- `./scripts/update_openapi.sh` → `0 errors` (redocly); diff openapi.yaml содержит только presence-поле.

## 4. E2E (`frontend/e2e/`, chromium, 1 worker; **все спеки на org ≠ default** — урок #989)

Org ≠ default в спеках: через API создать org (`POST /api/orgs` или существующий helper enterprise), membership для `admin@local`, сессии создавать в этой org (header `X-Org-Id` / `fpc_active_org_id`). Новый helper `e2e/helpers/nonDefaultOrg.mjs`.

### 4.1 `async-save-persistence.spec.mjs` (новый)
1. **kill-before-flush**: 5 правок → `page.close()` ДО debounce-окна → reopen session → правки на месте (markers в XML через API) + outbox дослал (нет pending, version инкрементирован).
2. **offline**: `context.setOffline(true)` → правки → индикатор «Сохранено локально / ожидает сеть» → setOffline(false) → сходимость, «Сохранено», markers на сервере.
3. **reload-mid-series**: правки → reload → продолжение правок → всё сходится; ровно одна доставка (idempotency: version инкремент соответствует числу батчей).

### 4.2 `async-save-multiuser.spec.mjs` (новый, два `browser.newContext()`)
4. **convergence**: оба клиента правят разные элементы → через `ops_committed` оба видят чужие правки без 409-лупа (≤1 409 суммарно, оба маркера у обоих).
5. **LWW-conflict**: одновременная правка одного elementId → победитель по серверной версии, у проигравшего toast + запись в «предложенных изменениях», применение по клику → обе правки последовательно на сервере.
6. **offline-catch-up**: клиент B offline, A правит; B online → B догоняет (fetch+rebase), свои pendingOps не теряет.
7. **soft-lock**: A выбирает элемент → у B badge «{user} редактирует этот элемент» (через presence, TTL-окно).

### 4.3 Регрессии (зелёные, org ≠ default где применимо)
- `async-save-operations.spec.mjs` — 3/3 (метрики step1: ≤10 kB, p95 <300 ms, coverage ≥0.95, 0 PUT вне fallback).
- `canvas-editing-stability.spec.mjs` (вкл. две-вкладки сценарий), save-e2e набора step1 TESTS.md §5.
- Backend suites §2.3.

### 4.4 Backend acceptance против живого uvicorn (урок #989)
TestClient маскирует threadpool ContextVar: ключевые пути (409 payload XML, ops_committed через SSE, presence editingElementId) дополнительно прогоняются против локального uvicorn-стека (compose-override спекой по образцу step1, env-lock; стек восстановить после) ИЛИ на stage post-deploy (фиксируется в EXEC_REPORT, что именно где прогнано).

## 5. Бюджеты приёмки (EXEC_REPORT фиксирует факт)

| Метрика | Бюджет |
|---|---|
| Потери правок (kill/offline/F5 сценарии) | 0 |
| Запись в IDB | ≤5 ms p95 (цель ~1 ms) |
| Тело /operations | ≤10 kB |
| p95 ответа /operations | <300 ms |
| Coverage mapped/total | ≥0.95 |
| Longtask >200 ms в серии | 0 |
| Полных PUT за серию правок (вне fallback) | 0 |
| 409-луп (multi-user) | ≤1 на сценарий, обе правки выживают |

## 6. Порядок прогонов
1. RED: новые unit-тесты падают по правильной причине (фиксируется в коммитах).
2. GREEN: реализация, unit-прогоны зелёные.
3. Регрессионные unit (§1–§2.3).
4. E2E §4.1–4.3 на org ≠ default.
5. Backend live-uvicorn acceptance §4.4 (или stage post-deploy).
6. EXEC_REPORT + REVIEW_REPORT.
