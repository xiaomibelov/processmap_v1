# PLAN — feature/async-save-pipeline-step2

> Контур: персистентный локальный outbox + доставка чужих операций (мультипользовательская конвергенция).
> Статус: **PLAN, ожидает approve пользователя. Код не пишется до approve.**
> Дата: 2026-09-16. Baseline: `origin/main` @ `999f0e37` (#989 fix/async-save-409-rebase смержен).
> Предшественники: step1 (#982, смержен), F1 (#983 hardening), D1, #989. Зависимости закрыты — precondition выполнен.

## 1. Runtime/source truth (зафиксировано)

- Workspace: `/Users/mac/agents_place/kimi_PM/p0-work-worktrees/feature-async-save-pipeline-step2` (worktree от `p0-work`, remote `origin git@github.com:xiaomibelov/processmap_v1.git`).
- Branch: `feature/async-save-pipeline-step2`, создана от `origin/main` = `999f0e37`. `git status`: clean.
- Код step1 (#982) и фикс #989 входят в baseline — rebase/cherry-pick не требуется.
- Ключевые факты кода (подтверждены чтением, worktree @ `999f0e37`):
  - Outbox: `frontend/src/features/process/bpmn/save/opsOutbox/` (in-memory `buffer`, ack-семантика `inFlightSentCount`, `degrade()`, `fullSavePreserveFrom`).
  - Координатор: `frontend/src/features/session/saveCoordinator.js` (pipeline `"ops"`, retry 1s→2s→4s cap 4s **без джиттера** — `:662`; конфликт-гейт, события `status/success/error/conflict`).
  - CAS: `frontend/src/lib/casVersionTracker.js` — **полностью in-memory, reload не переживает**; `casResponse.js` — канонические ридеры ack/409.
  - Индикатор: `DiagramToolbarSaveStatusSlot.jsx` + `saveStatusSlotModel.js` (`OPS_STAGE_VIEW`, паттерн sublabel — `subprocessesSyncLabel`).
  - SSE: endpoint `GET /api/sessions/{id}/events` существует (`backend/app/routers/session_events.py:58`, `?access_token=` разрешён только для него, `startup/middleware.py:102-121`); шина `backend/app/services/session_event_bus.py` — **in-process only**, публикуется только `session_deleted`; фронт-клиент `frontend/src/hooks/useSessionEvents.js` (потребляет `session_deleted`, polling-fallback 15 s).
  - Presence: `POST/DELETE /api/sessions/{id}/presence` (`sessions_core.py:711-796`), таблица `session_presence` TTL 60 s, advisory-only, **soft-lock отсутствует**; фронт `useSessionPresence.js`.
  - IndexedDB: используется сырым API (`bpmnPacks.js:163`, `bpmnSnapshots.js:115-180`), библиотек idb/Dexie в проекте нет, новые депы не вводились.
  - Workers: отсутствуют полностью.
  - Backend uvicorn `--workers ${WEB_CONCURRENCY:-2}` (`docker-entrypoint.sh`) ⇒ in-process шина событий **не достаёт до подписчиков на другом worker** — нужен Redis pub/sub fan-in.
  - Uvicorn sync-def endpoint'ы крутятся в anyio threadpool ⇒ ContextVar org-scope пуст; урок #989: scoped-load только с явным `org_id`. Латентный дефект того же класса остался в `_save_session_with_cas` conflict-reload (`backend/app/session_helpers.py:281`, load без org) — закрываем в этом контуре.
  - Вход в сессию: `frontend/src/app/useSessionActivationOrchestration.js:189-376` (`apiGetSession` → `setTrackedDiagramStateVersion` → snapshot-reconcile) — точка привязки политики «кто новее».
  - e2e: `frontend/e2e/async-save-operations.spec.mjs` (735 строк, collectors, org через `fpc_active_org_id`/header), прецедент двух контекстов `canvas-editing-stability.spec.mjs:151-176`, auth `helpers/e2eAuth.mjs` (`admin@local/admin`).

## 2. Проблема / миссия

Step1 дал дельта-save с in-memory outbox: acceptance step1 зелёный (`/operations` 4042 B, p95 163 ms, coverage 1.00, 0 полных PUT за серию, 409-race авто-rebase после #989 корректен во всех org). Уязвимость: outbox живёт в памяти вкладки — F5 / закрытие вкладки / обрыв сети до flush = **потеря неотправленных правок**. Миссия step2: сделать локальный буфер персистентным (IndexedDB), сеть убрать из критического пути подтверждения правки, добавить доставку чужих операций для мультипользовательской конвергенции.

## 3. Наследие step1 (обязательный scope, 6 пунктов)

Источник: EXEC_REPORT/REVIEW_REPORT step1 (N-new-1, NIT-1/2/4, residual BLOCKER-2). Как закрываем:

1. **Residual undo-sent-unacked в окне RTT** (data-loss класс, приоритет высокий). Мутация отправленного префикса во время полёта (undo неподтверждённой op → push → ack снимает splice-префиксом вместе с новой op). Фикс: на диспетчеризации **детач** отправленного списка (`pendingAck = buffer.splice(0)`), буфер продолжает жить независимо; ack снимает только детачнутые; та же механика для `fullSavePreserveFrom`. Регрессионный тест: push → flush(hang) → undo отправленной op → push → ack → новая op обязана уйти следующим flush.
2. **Parent re-embed ordering** (NIT-1): parent subprocess re-embed сейчас идёт до SQL-CAS commit (`_legacy_main.py:~4995-5033`) → transient parent/child divergence при CAS-409. Фикс: в operations-handler перенести re-embed **после** commit child-строки; ошибка re-embed — изолированный retry, не откатывающий child. Контракт: нет видимой parent/child рассинхронизации. PUT /bpmn не трогаем. API.md §3 step1 привести к факту.
3. **Dead keepalive-код**: удалить `isWithinKeepaliveBudget` (`opsBatchSerializer.js:60-62`), `keepaliveBodyLimitBytes`, `pageHideDrainTimeoutMs` (`opsOutboxConfig.js:23,25`) и их тесты.
4. **Двойная регистрация роута**: удалить legacy-вариант `@app.post` (`_legacy_main.py:4851`), оставить router-вариант `routers/sessions.py:243`; проверить, что `LEGACY_ROUTE_EXPORT` этот путь не экспортирует; регрессионный тест «ровно одна live-регистрация».
5. **Manual full-save ack wipe → version-based reconciliation**: ручной full-save по ack не чистит буфер слепо. Расчёт: ack `diagramStateVersion` ≥ `baseVersion + sentCount` ⇒ снять подтверждаемый префикс (и из IDB), иначе оставить (идемпотентность opId на сервере делает повторную доставку безопасной). Outbox-initiated путь (`fullSavePreserveFrom`) сохраняется.
6. **reconnect*/create-op replay в op-vocabulary** (покрытие commandStack сверх 8 базовых типов):
   - `connection.reconnect` (нормализация reconnectStart/End в одну op) → клиентский маппер + серверный applier: rewrite source/target, перелинковка incoming/outgoing, обновление DI-edge. Валидация минимальная (source/target существуют в XML); rules-движок bpmn-js **не дублируем** — зафиксированное отступление (частота низкая, семантика применяется клиентом к live-модели при rebase).
   - Create-op replay: id генерирует клиент и передаёт в `shape.create`/`connection.create`; сервер применяет **с сохранением id** (без регенерации) ⇒ replay create при 409-rebase безопасен, `needsFullSave`-fallback для create-ops убирается.

## 4. Схема хранения: IndexedDB `pm-save-outbox`

**Выбор: сырой IndexedDB + маленький helper, без idb/Dexie.** Обоснование: (а) проектный прецедент — два сырых IDB-потребителя без библиотек (`bpmnPacks.js`, `bpmnSnapshots.js`); (б) дисциплина «без новых депов»; (в) схема мизерная (2 стора, 2 индекса), API surface helper'а ~6 методов; (г) цель ~1 ms на запись достижима и без обёртки. Dexie не даёт ничего нужного этого контуру за цену зависимости.

БД `pm-save-outbox`, version 1:

- **store `operations`**, keyPath `opId`:
  - поля: `opId` (uuid), `sessionId`, `baseVersion` (nullable, справочно на мом enqueue; отправочный base resolve'ит `casVersionTracker` at send time — canonical source остаётся tracker), `payload` (wire-op без `__*`-служебных полей), `ts` (enqueue), `source` (`user|agent|e2e|replay`).
  - индексы: `bySession (sessionId)`, `bySessionTs ([sessionId, ts])`.
- **store `syncState`**, keyPath `sessionId`:
  - поля: `lastServerVersion` (последний подтверждённый сервером `diagram_state_version`), `lastLocalVersion` (монотонный локальный счётчик правок, НЕ версия сессии), `updatedAt`.

Правила:
- **Запись правки в IDB = мгновенное подтверждение в UI (~1 ms)**; flush в сеть — фон. Запись через микро-очередь (последовательные tx, `readwrite`), не блокирующая commandStack.
- **Eviction**: ack 200 `/operations` ⇒ удалить подтверждённые opId (детачнутый `pendingAck`-список) из IDB, `syncState.lastServerVersion = ack.version`. Eviction только после ack — до него op живёт и в памяти, и в IDB.
- Очистка при выходе из сессии без pending: `syncState` сохраняется для детекта расхождения; ops при пустом буфере отсутствуют.
- Деградация IDB (unavailable/denied): outbox работает как в step1 (in-memory), индикатор показывает «сохранено локально (сессия)» без durable-гарантии — fallback, не блокер.

## 5. Политика «кто новее» при входе в сессию

Точка привязки: `useSessionActivationOrchestration.openSession` после `apiGetSession` (до snapshot-reconcile). Обозначения: `serverVersion` = `diagram_state_version` из `apiGetSession`; `local = syncState(sessionId)`.

1. `local` отсутствует или `local.lastServerVersion === serverVersion` и нет pending ops → чистый вход (как сейчас).
2. Есть pending ops и `serverVersion === local.lastServerVersion` (правили только мы, не ушедшее дослать) → **догоняем сервер дельтами**: гидрация буфера из IDB, обычный flush (base = `serverVersion`).
3. `serverVersion > local.lastServerVersion` (чужие/другие-вкладки правки ушли на сервер) → **fetch актуального XML** (`GET /bpmn`) + rebase локальных pendingOps поверх серверного документа (механизм step1 `opsRebase` + загрузка через `runtime.load(xml,{source:"ops_rebase"})`, echo-muted; фундамент после #989 org-корректен) → затем flush.
4. `serverVersion < local.lastServerVersion` в норме невозможно (версия монотонна); если встретилось — трактуем как п.3 с полным fetch (консервативно) и фиксируем в телеметрии.

Каждая ветка — отдельный unit-тест (гидрация, догон дельтами, fetch+rebase, консервативный путь).

## 6. МУЛЬТИПОЛЬЗОВАТЕЛЬСКАЯ МОДЕЛЬ (обязательный раздел)

1. **Источник истины — только сервер.** Версию присваивает сервер (`_mark_diagram_truth_write`, +1 на truth-write). Локальная «версия» клиента — НЕ версия сессии: состояние клиента = `(seenServerVersion, pendingOps[])`. Сравнение «кто новее» — только детект расхождения (§5), **никогда** для выбора победителя.
2. **Сериализация записи**: optimistic locking по `baseVersion` (step1, сохраняется). Конкурирующие батчи упорядочивает сервер (Redis session lock 15 s + SQL CAS); проигравший получает 409 с `server_current_version` + `server_current_xml` и ребазится (механизм step1/#989, без изменений протокола).
3. **Доставка чужих операций**: существующий SSE `GET /api/sessions/{id}/events?access_token=…`. Новое событие шины `ops_committed { sessionId, version, operations[], actorClientId, full, at }`:
   - publisher — operations-handler после commit (и full-save путь с `operations=[]`, `full=true`);
   - **multi-worker**: шина расширяется Redis pub/sub fan-in (канал `pm:session-events`; publisher пишет local bus + redis; SSE-процесс подписан на оба). Redis down → in-process only (деградация документирована, watchdog восстановит);
   - клиент (`useSessionEvents.js` + подписка в wiring): собственные ops игнорируются по `actorClientId`/opId (opId-дедупликация сервером снимает гонки повторной доставки); чужие ops применяются к live-модели с `__pmOpSource:"remote"` (echo-suppression существует), затем свои pendingOps ребазятся поверх: undo pending → apply remote → redo;
   - несовместимые/неприменимые чужие ops → сессия переводится в консервативный fetch+rebase (тот же путь, что п.3 §5).
4. **Конфликт на одном elementId**: LWW по серверной версии (порядок применения на сервере — канон). Проигравшая клиентская op **не затирается молча**: при rebase детектится пересечение по `elementId` между incoming ops и своими pendingOps → проигравшая op уходит в **«предложенные изменения»** (панель в сессии, persisted в IDB-сторе `proposed` — расширение схемы §4, та же БД version 2) + toast-уведомление с переходом к элементу. Применение предложенного — явное действие пользователя (новая op в буфере).
5. **Профилактика конфликтов**: soft-lock поверх существующего presence-канала. Presence-touch расширяется опциональным `editingElementId` (heartbeat ~15 s, TTL = presence TTL 60 s, advisory). UI: «{user} редактирует этот элемент» на выбранном элементе + в presence-панели. **Hard-lock не вводить.**
6. **Два таба одного пользователя = два независимых клиента** (отдельные `clientId`, отдельные outbox). Протокол не меняется: гонки покрывает opId-дедупликация сервером + версионный CAS.
7. **CRDT (Yjs) НЕ вводить** — decision record: converge-by-server-order + client rebase покрывает текущие сценарии (процессные диаграммы, правки эпизодические, конфликты редки и разрешимы LWW + предложенные изменения). Yjs = избыточная сложность (model binary state, schema migration). Пересмотр — только по эмпирическому evidence конфликт-лупов в проде.

**УРОК #989 (блокирующий для acceptance):**
- Все acceptance/e2e спеки контура обязаны прогоняться на **org ≠ default** (создание второй org через API в спеке, сессии в ней; прецедент — фиксация membership INSERT'ом в `org_memberships` из `test_session_operations_api.py`).
- Backend-acceptance не полагаться только на TestClient (прокидывает org ContextVar в thread endpoint'а, маскируя баги класса #989): ключевые пути (409 payload, ops_committed, presence) дополнительно прогоняются против живого uvicorn-стека (docker) или на stage post-deploy.
- Заодно закрывается латентный org-hazard `_save_session_with_cas` conflict-reload (`session_helpers.py:281`): reload с явным `org_id` (паттерн #989), регрессионный тест по образцу `test_conflict_includes_server_xml_for_non_default_org`.

## 7. Backend scope

1. `ops_committed` publisher: operations-handler после commit (+ full-save путь), payload §6.3; без изменения REST-протокола `/operations` (ack-формат step1 сохраняется).
2. Redis pub/sub fan-in для `session_event_bus` (§6.3); подписка в `session_events.py`.
3. Parent re-embed ordering (наследие п.2 §3).
4. Удаление legacy-дубля роута (наследие п.4 §3).
5. `connection.reconnect` в серверном applier + client-generated id для create (наследие п.6 §3).
6. Org-explicit conflict reload в `_save_session_with_cas` (урок #989).
7. Presence-touch: опциональное `editingElementId` в `SessionPresenceTouchIn` + отдача в `active_users` ⇒ **регенерация `docs/openapi.yaml`** (`scripts/update_openapi.sh`, redocly 0 errors; правило AGENTS.md §6.1). SSE-события в openapi не входят (streaming endpoint уже описан), описание события — в API.md контура.

## 8. Frontend scope

1. **Персистентный outbox**: новый модуль `save/opsOutbox/persistence/` (IDB helper по §4 + журналирование буфера). Жизненный цикл: `pushCommand` → append IDB (~1 ms) → UI «сохранено локально»; ack → eviction (§4). Гидрация при входе (§5). Наследие п.1/п.5 §3 — в `createSaveOutbox.js`.
2. **Фоновый sync**: существующий debounce-координатор остаётся транспортом; добавляется `online`-триггер (`window` `online`/`offline` + `navigator.onLine`-gate перед flush) и keepalive-flush при `pagehide` (существующий путь). **Web Worker отвергнут**: нет инфраструктуры workers, transport/auth/coordinator-контекст живут в странице, батчи ≤10 kB раз в 2.5 s — нагрузка на main-thread пренебрежима; вынос = дублирование транспорта. Retry-параметры приводятся к контракту F1: base 1 s, factor 2, **cap 8 s, jitter ±30%, retryCount 3** (параметризация backoff координатора `:662`, сейчас 1→2→4 cap 4 s без джиттера).
3. **Индикатор**: двухсостоянийный бейдж «Сохранено локально» → «Синхронизировано» через существующий `OPS_STAGE_VIEW` + sublabel-паттерн (`subprocessesSyncLabel`): локально-подтверждённое, не ушедшее = «Сохранено локально · ожидает сеть», ack = «Сохранено». Degraded/rebase-стейты сохраняются. `degraded` **не персистится** (per-page sticky, как задумано step1).
4. **ops_committed-consumer**: расширение `useSessionEvents.js` + wiring (`bpmnWiring.js`): apply remote → rebase pending → LWW-детект → «предложенные изменения» (панель + IDB-стор `proposed`).
5. **Soft-lock UI**: badge «{user} редактирует элемент» (presence-расширение §6.5).
6. Наследие п.3 §3 (dead keepalive-код — удаление), п.6 §3 (reconnect/create-op в `commandToOps.js`).
7. **Coverage-контракт step1 сохраняется**: `__PM_OPS_COVERAGE__` ≥0.95 на расширенном корпусе; расширение vocabulary мониторится, падение ниже порога — блокер PR.

## 9. Тесты

**Unit (frontend):**
- Персистентность outbox: append/гидрация/eviction; запись ~1 ms (budget-ассерт); IDB-unavailable fallback.
- Дедупликация opId при гидрации и replay (два таба — независимые буферы; серверный dedup покрыт api-тестами).
- Rebase при входе: 4 ветки §5.
- Наследие: undo-sent-unacked детач (регрессия N-new-1), version-based reconciliation manual full-save, reconnect-маппинг, create-op replay, dead-code удаление (grep-контракт в тесте).

**Unit (backend):**
- `ops_committed` публикация (in-process bus + redis pub/sub, multi-worker fan-in — тест подписчика на втором «процессе» через redis-mock/интеграционный redis).
- `connection.reconnect` applier: rewrite source/target, incoming/outgoing, DI-edge; negative: отсутствующий source/target → 422 batch-rollback.
- Create-op с клиентским id: применение с сохранением id; replay-идемпотентность.
- Один live-route после удаления дубля; parent re-embed после commit (порядок + отсутствие divergence при CAS-409).
- Org-regression: `_save_session_with_cas` conflict reload с явным org (паттерн #989).

**E2E (chromium, 1 worker; org ≠ default во всех спеках — урок #989):**
1. Правки → kill вкладки до flush → переоткрытие → правки на месте (hydration из IDB) и досланы на сервер (проверка через API/XML).
2. Офлайн-режим (`context.setOffline`) → правки → восстановление сети → полная синхронизация без потерь; индикатор «Сохранено локально» → «Сохранено».
3. Мультипользовательский: два контекста в одной сессии → правки разных элементов → сходимость через `ops_committed` **без 409-лупа** (нет повторных 409 подряд, обе правки выживают у обоих).
4. Правка одного `elementId` двумя клиентами → LWW по серверной версии + уведомление; проигравшая op видна в «предложенных изменениях», применение по действию пользователя.
5. Офлайн-клиент с pendingOps догоняет сессию после чужих правок без потери своих (fetch+rebase ветка §5.3).
6. F5/reload в середине серии — восстановление и догон (связка с п.1).
7. Регрессии step1/F1/D1/#989: полный набор из TESTS.md §5 step1 (`async-save-operations.spec.mjs` 3/3, save-e2e, backend suites, canvas-editing-stability).

**Acceptance-метрики (фиксируются в EXEC_REPORT):** метрики step1 не деградируют (тело ≤10 kB, p95 <300 ms, coverage ≥0.95, 0 полных PUT за серию правок вне fallback-сценариев) + новые: потерь правок при F5/kill/offline = 0 во всех сценариях; запись в IDB ≤5 ms p95 (цель ~1 ms).

## 10. Критерии приёмки

1. Ни одна правка не теряется при F5 / закрытии вкладки / обрыве сети до flush (e2e п.1/п.2/п.6).
2. При повторном входе локальная и серверная версии сходятся без ручного вмешательства (ветки §5).
3. Мультипользовательские e2e зелёные: сходимость без 409-лупа, LWW + предложенные изменения, offline-catch-up (e2e п.3–п.5).
4. Наследие step1 (пункты 1–6 §3) закрыто.
5. Регрессий step1/F1/D1/#989 нет (§9.7).
6. `docs/openapi.yaml` регенерирован, redocly 0 errors; live-route ровно один.

## 11. Риски и ответы

- **IndexedDB write latency / quota**: батчи малы; budget-ассерт в e2e; fallback на in-memory при недоступности — не блокер.
- **ops_committed на multi-worker**: Redis pub/sub — единственная новая инфраструктурная зависимость; Redis уже обязателен для locks/cache (degraded-mode существует). Redis down ⇒ in-process only, доставка между worker'ами паузится — документированная деградация, не потеря (клиенты догонят по версии при входе/409).
- **Remote-apply ломает DI/waypoints**: тот же риск, что rebase step1 — митигация: применение через существующий `applyOps` proven-путь + консервативный fetch+rebase при неприменимости.
- **«Предложенные изменения» — UX-сложность**: bounded MVP-панель (список op → элемент → «применить»), без merge-редактора.
- **Presence soft-lock ложные срабатывания** (вкладка убита без leave): TTL 60 s + heartbeat 15 s снимают; advisory-only, не блокирует редактирование.

## 12. Open questions (не блокируют approve)

- IDB в unit-тестах: `fake-indexeddb` в devDeps vs собственный in-memory mock. Дефолт — mock без новых депов; если покрытие страдает, пересмотр на review.
- Порог размера `proposed`-стора (cap по числу op на сессию) — параметр конфигурации, дефолт 100.
- Нужен ли отдельный `GET /presence` для soft-lock без touch-поллинга — оставляем touch-ответ (существующий механизм), не добавляем endpoint.

## 13. Артефакты и процесс

- Артефакты: `.planning/contours/feature/async-save-pipeline-step2/` (этот PLAN.md, затем API.md/UI.md/TESTS.md/PR.md, EXEC_REPORT.md, REVIEW_REPORT.md, STATE.json, флаги `READY_FOR_EXECUTION`/`READY_FOR_REVIEW`).
- Ветка: `feature/async-save-pipeline-step2` (создана, от `origin/main @ 999f0e37`). PR — на русском. **Merge/deploy — только после явного approve пользователя.**
- Дисциплина: TDD (RED→GREEN), systematic debugging, review gate (Agent 3), Obsidian-mirror через `tools/pm-agent-mirror-report.sh`.
- Env: прогоны на локальном docker-стеке под `tools/pm-env-lock.sh`; stage post-deploy верификация ключевых спеков (орг ≠ default).
