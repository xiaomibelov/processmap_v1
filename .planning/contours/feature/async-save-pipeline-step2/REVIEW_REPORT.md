---
contour: feature/async-save-pipeline-step2
role: reviewer
agent: Agent 3
date: 2026-09-16
verdict: CHANGES_REQUESTED
blockers: 2
majors: 3
---

# REVIEW_REPORT — feature/async-save-pipeline-step2 (Agent 3, Reviewer)

> Дата: 2026-09-16. Ревьюер: Agent 3. Объект: `git diff origin/main...HEAD` (6 коммитов, `999f0e37..11b32cde`).
> Дисциплина: receiving-code-review — все утверждения EXEC_REPORT проверены против кода и независимыми прогонами; отчётам не доверял.
> Ревьюер read-only: код не изменялся.

## Вердикт: **CHANGES_REQUESTED**

Контур в целом качественный: pendingAck-детач, гидрация→scheduleFlush, eviction только-после-ack, org-explicit reload (#989-паттерн на всех write-путях кроме одного), route-dedup, publisher после durable commit, redis-релей с корректным lifecycle, openapi ровно 4 строки — всё это подтверждено моими прогонами и чтением кода. Бэджеты из e2e-логов сходятся с заявленными.

Однако найдено **два BLOCKER'а класса «молчаливая дивергенция/потеря»** — ровно тот класс, который контур обязан был устранить:

- **B1**: consumer `ops_committed` replay'ит оставшиеся pending-ops на live-модель, которая **уже содержит** эти правки (нет undo → apply → redo) — delta-op (`shape.move`) применяется второй раз → клиентский канвас расходится с сервером. Все multi-user e2e используют только rename (идемпотентен) — баг маскирован.
- **B2**: version-based reconciliation ручного full-save опирается на арифметику `ack.version >= base + sentCount`, но сервер инкрементирует версию **+1 на батч, а не на op** (`_mark_diagram_truth_write`) → ветка drain срабатывает необоснованно и **удаляет из буфера и journal ops, дописанные во время полёта flush** (потеря), а ветка keep + последующий 409 ведёт в replay на серверный XML, уже содержащий эти ops (двойное применение).

Плюс регрессия тестов на ветке (2 упавших теста против baseline, claim «fail-set байт-идентичен» не подтверждён) — MAJOR.

## Проверочная база (что реально прогнано ревьюером)

| Прогон | Результат |
|---|---|
| `pytest tests/test_session_operations_api.py tests/test_ops_applier_parity.py tests/test_ops_committed_events.py -q` (`/tmp/step2-be-venv/bin/python`) | **64 passed** + 3 subtests (21.5 s) — сходится с EXEC_REPORT (33+21+10) |
| `node --test` все `*.test.mjs` в `opsOutbox/` (рекурсивно) | **128/128 pass** — claim подтверждён |
| `node --test` consumer/presence/slot/proposed/api-client-id (8 файлов) | **40 тестов: 37 pass, 3 fail** — 2 из 3 падений атрибутированы контуру (см. M2); 3-й (ttl 60s) pre-existing |
| Те же presence-файлы на baseline `origin/main @ 999f0e37` (temp worktree `/tmp/step2-baseline`, node_modules symlink) | 10 тестов: 9 pass, **1 fail** (pre-existing ttl) → контур добавил **2 failing-теста** |
| Code-read | `createSaveOutbox.js` (полностью), `opsRemoteApply.js`, `opsRebase.js`, `reconciliation.js`, `presenceModel.js`, `useSessionPresence.js`, `sessionPresenceModel.js`, `opsOutboxConfig.js`, `opsBatchSerializer.js`, `useSessionEvents.js`, `App.jsx`, `useSessionActivationOrchestration.js`, `BpmnStage.jsx` (diff), `useBpmnSync.js`, `backend/_legacy_main.py` (publisher, re-embed, ops-handler), `session_event_bus.py`, `redis_client.py`, `session_events.py`, `session_helpers.py`, `sessions_core.py`, `ops_applier.py`, `legacy_api.py`, оба repository, `saveCoordinator.js` (diff = 0 строк), `docs/openapi.yaml` (diff = 4 строки), `apiRoutes.js`/`api.js` (cacheBust), e2e-логи в `e2e-runs/`, `acceptance.py` |
| `_mark_diagram_truth_write` (`session_helpers.py:175-198`) | Версия +1 на truth-write (батч), **не на op** — ключевой факт для B2 |
| Route dedup | `grep`: `/api/sessions/{session_id}/operations` — 1 регистрация (`routers/sessions.py:243`), в `_legacy_main.py` 0 |
| saveCoordinator diff | **0 строк** — backoff xml/meta нетронут (claim ✓) |

Live-uvicorn acceptance (13/13) самостоятельно не перегонял — требует repoint docker-стека под env-lock (executor-территория). `acceptance.py` прочитан: проверки реальные (org ≠ default через API, 409 XML, SSE ops_committed живым подписчиком, presence echo), дизайн sound. Частично верифицировано.

## Findings

### BLOCKER-1. Remote-apply replay'ит pending-ops на модель, которая уже их содержит → двойное применение delta-ops

- **Где:** `frontend/src/features/process/bpmn/save/opsOutbox/opsRemoteApply.js:249-257` (шаг 7: `replayPendingOps(remaining)`), wiring `BpmnStage.jsx` → `outbox.replayPendingOps` → `opsRebase.js:310-312` → `replayOpsOnModeler` → `commandStack.execute`.
- **Факт:** pending-ops буфера — это правки пользователя, **уже применённые в live-modeler** (так они и стали ops). Consumer применяет incoming remote ops (`replayOpsOnModeler(..., {source:"remote"})` — корректно, их в модели не было), затем replay'ит **оставшиеся** pending «поверх обновлённой модели» **без предварительного undo**. Для `shape.move` (delta `{x,y}`) это второе применение того же delta: канвас уезжает на 2×delta. Следующий flush уходит с исходным opId/delta → сервер применяет delta **один раз** → клиент и сервер расходятся навсегда (индикатор «Сохранено»). Последующий full-save закрепляет дивергенцию в durable-состоянии.
- **Контракт:** PLAN §6.3 требовал «undo pending → apply remote → redo» — реализация undo/redo-фазу опустила; UI.md §4 шаг 4 сформулирован как «rebase оставшихся pendingOps поверх обновлённой модели», но rebase через replay на модели, уже содержащей эти ops, семантически неверен: для непересекающихся по elementId ops корректное действие — **ничего** (правки уже в модели). Replay здесь нужен только после полной перезагрузки модели из серверного XML (ветка fetch+rebase) — там он и есть (`applyServerReconciliation`).
- **Почему тесты зелёные:** все 4 multi-user e2e (`async-save-multiuser.spec.mjs`) правят **только имена** (`updateLabel` → `element.updateProperties`, идемпотентен при повторном применении). Сценария сходимости с move/resize-op и ассертом позиции нет. `opsRemoteApply.test.mjs` мокает `applyRemoteOps`/`replayPendingOps` — реальный контракт «модель уже содержит pending» не проверяется ни разу (класс step1 BLOCKER-1: тесты воображаемого контракта). Уязвимость к `shape.move` — resize/waypoints/bounds абсолютны и идемпотентны; `updateProperties` идемпотентен.
- **Окно:** op живёт в буфере до debounce-flush (2.5 s) — событие от другого пользователя в этом окне обычное дело при реальной совместной работе.
- **Фикс-рекомендация:** шаг 7 удалить либо заменить на undo→apply→redo по спецификации PLAN §6.3 (undo pending через commandStack с теми же opId-флагами, apply incoming, redo). Регрессионный тест: real modeler (или интеграционный через `replayOpsOnModeler`) — pending move + incoming rename → позиция элемента не меняется после handleEvent; flush уходит с исходной delta. E2E: convergence-сценарий с move-op и ассертом позиции у обоих клиентов.

### BLOCKER-2. Version-based reconciliation manual full-save: арифметика несостоятельна (+1/батч ≠ +1/op), drain-ветка теряет post-flight ops

- **Где:** `createSaveOutbox.js:869-885` (coordinator "success" xml/rawXml, ветка без sentinel), мета — `:480-483`. Серверная семантика версии: `backend/app/utils/session_helpers.py:175-198` — `diagram_state_version + 1` на **truth-write** (один на весь committed-батч ops; full-save — ещё +1).
- **Факт 1 (арифметика):** порог `baseVersion + sentCount` предполагает +1 на op. Реально батч из N ops двигает версию на 1. Для `sentCount ≥ 2` условие `ack.version >= base+sentCount` **недостижимо** собственным батчем (max base+2 при full-save следом) → ветка keep срабатывает систематически: restore + re-flush + в полёте исходного запроса → 409 → rebase-replay ops на серверный XML, который **уже содержит** их эффекты (full-save сериализовал modeler) → двойное применение delta (тот же класс, что B1). Идемпотентность opId тут не спасает: дивергенция на клиентском канвасе.
- **Факт 2 (потеря в drain-ветке):** при `sentCount === 1` порог `base+1` проходит при **любом** commit после диспетчеризации (включая сам full-save, который мог сериализовать XML до post-flight правки). Ветка `else` (`createSaveOutbox.js:880-884`) делает `dropped = buffer; buffer = []; journalRemove(dropped)` — **ops, дописанные в буфер во время полёта flush, удаляются из буфера И journal без подтверждения их покрытия сервером**. Сценарий: dispatch [A] → in-flight → пользователь правит (D в буфере и IDB) → manual save сериализует modeler до D → commit → ack.version = base+1 ≥ base+1 → drain → D стёрт локально, на сервере отсутствует → молчаливая потеря правки. Это ровно ack-wipe класса step1 BLOCKER-2, который contour заявлял закрыть.
- **Дополнительно:** `lastDispatchMeta` не сбрасывается на ack (только на conflict/error) — порог со временем становится «стale», semantics «сервер видел наш батч» из версии невосстановима в принципе: версия не кодирует членство op в history (чужой commit двигает версию так же).
- **Почему тесты зелёные:** unit-тест наследия п.5 (`createSaveOutbox.persistence.test.mjs`) проверяет обе ветки с **выдуманной** арифметикой сервера (мок ack.version подгоняет под `base+sentCount`). Реальная серверная семантика (+1/батч) в тесте не воспроизведена; interleaving «manual full save во время полёта ops-flush + правка в окне» не покрыт ни unit, ни e2e.
- **Фикс-рекомендация:** минимально безопасное поведение — на manual full-save ack не трогать буфер вообще (семантика step1: ops досылаются обычным flush, серверная opId-идемпотентность делает повтор безопасным); либо drain **только** подтверждаемого pendingAck-префикса с опорой не на версионную арифметику, а на явный признак (например, серверный ack full-save, включающий список применённых opId — расширение протокола, вряд ли оправдано в этом контуре). Версионный детек оставить только для adopt seenServerVersion. Регрессионные тесты: (а) real server semantics (+1/батч) в моке ack; (б) in-flight + post-flight push + manual ack → post-flight op обязан уйти следующим flush; (в) in-flight + manual save (XML содержит ops) + 409 → позиция не удваивается.

### MAJOR-1. Cross-tab same-user: общий IDB-journal ломает own-op-echo фильтр — события соседней вкладки игнорируются

- **Где:** `opsRemoteApply.js:169-174` (фильтр «все opId ∈ journal → own echo → игнор»), `persistence/opsJournal.js` (IDB `pm-save-outbox` — **общая на origin**, все вкладки делят один journal).
- **Факт:** PLAN §6.6 фиксирует «два таба одного пользователя = два независимых клиента». clientId различны (sessionStorage per-tab ✓), actor-фильтр их не отсечёт. Но opId-фильтр читает **общий** journal: pending-ops вкладки B лежат в том же IDB → событие `ops_committed` от B у вкладки A проходит проверку «все opId ∈ journal.pending» → **ignored: "own-op-echo"** → A не применяет чужие-же-свои правки B в live-модель. В e2e два контекста Playwright имеют раздельные storage-partition → journal'ы не делятся → тест проходит; в реальном браузере две вкладки одного пользователя IDB делят.
- **Окно:** пока ops B pending в общем journal (до ack/eviction). Server state при этом корректен (дедуп по opId), дивергенция — клиентская модель вкладки A до reload/409-heal.
- **Фикс-рекомендация:** own-op-echo фильтр ограничить opId **собственного буфера** (`getPendingOps()`), а не общего journal; либо scope journal по clientId (индекс/префикс ключа). Регрессионный тест: общий journal-мок с чужими (другого clientId) pending opId → событие применяется.

### MAJOR-2. Регрессия frontend-тестов на ветке: 2 failing-теста, claim «fail-set байт-идентичен baseline» не подтверждён

- **Где:** `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs:86` (`normalizeSessionPresenceUsers maps backend shape...`), `:241` (`touch payload includes editingElementId...`); имплементация — `presence/presenceModel.js:44-57`, `useSessionPresence.js:94-98`.
- **Факт:** (а) контур добавил `editingElementId: ''` в каждый объект `normalizeSessionPresenceUsers` и **не обновил** существующий deepEqual-тест → pre-existing тест упал (на baseline @999f0e37 — pass, на ветке — fail; прогнано в `/tmp/step2-baseline`). (б) Контур-добавленный тест `editingElementId (cleared on deselect)` ждёт `payload.editingElementId === ""`, а имплементация **опускает ключ** (`...(editingElementId ? {editingElementId} : {})`) → `undefined !== ""` → fail. Поведение на wire при этом корректно (backend: отсутствие поля = снятие, `sessions_core.py:742` строка `editing_element_id=str(getattr(inp,..., "") or "")`), т.е. расходится тест и реализация — класс «тест воображаемого контракта» (step1 BLOCKER-1 дисциплина). (в) Третий fail (`session presence default ttl is sixty seconds`) — pre-existing (TTL-константа 90000 против ассерта 60 s), на ветке и baseline одинаково, контур не причём.
- **Claim EXEC_REPORT** «полный suite 3309 тестов, fail-set (160) байт-идентичен baseline — 0 регрессий» и «новые presence-тесты 21/21» — **опровергнуто** моими прогонами (2 новых failing на затронутых файлах). `npm test` включает эти файлы (`node --test $(find src -name '*.test.mjs')`).
- **Фикс:** привести тест и имплементацию к одному контракту (либо всегда слать `editingElementId: ""` на deselect — что точнее по API.md «пустая строка = снятие», либо поправить тест на `undefined`), обновить deepEqual с `editingElementId: ""`, пересчитать fail-set честно.

### MAJOR-3. Multi-user e2e покрывают только идемпотентные op-типы — маскируют B1

- **Где:** `frontend/e2e/async-save-multiuser.spec.mjs` — все сценарии через `renameElement` (`updateLabel` → `element.updateProperties`).
- **Факт:** ни одного move/resize/waypoints-сценария сходимости с ассертом геометрии у обоих клиентов; именно поэтому B1 не пойман. Утверждённый бюджет «обе правки выживают у обоих» доказан только для идемпотентного типа.
- **Фикс:** convergence-сценарий: A move'ит Task_1, B rename'ит Task_2 (или move другого элемента) → ассерт позиции у обоих клиентов через `elementRegistry` + markers на сервере. До исправления B1 ожидаемо упадёт — хороший RED.

### NIT-1. `_save_session_with_cas` без org_id на пути clear-session

- `backend/app/_legacy_main.py:5606-5611` — единственный write-call-site `_save_session_with_cas`, не передающий `org_id` (4792/5173/5506 передают `oid_locked`). В conflict-reload упадёт в default-org load с fallback на in-memory `sess`. Узко (clear-команда), не блокер.

### NIT-2. Частичный отказ IDB-write молча понижает durability

- `createSaveOutbox.js:300-307` — `journalAppend` глотает любую ошибку. Полная недоступность IDB — задокументированный fallback (UI.md §1); транзиентный сбой записи mid-buffer → память и journal расходятся, при kill вкладки теряется хвост после последней успешной записи, безо всякого сигнала. Рекомендую: telemetry-лог + однократный status « durable гарантия потеряна» (не блокер: server state не страдает, потеря только при смерти вкладки в окне).

### NIT-3. Redis-релей: pubsub-соединение на каждый SSE-стрим

- `session_events.py:20-64` — `_redis_relay_task` открывает отдельный pubsub на каждый SSE-подписчик (не на процесс). При десятках активных стримов — churn соединений к redis; фильтрация по session_id дублируется в каждом таске. Работоспособно (close в finally ✓, cancel при закрытии стрима ✓, QueueFull — drop с логом ✓), double-delivery session_deleted безопасна (клиент идемпотентен). На будущее: один pubsub на процесс + демультиплексия в локальные очереди.

### NIT-4. «E2E 10/10» против артефактов

- `e2e-runs/final-all.log` — фактически **9/10**: convergence упал на «diagram readiness timeout» при bootstrap (инфраструктурный флейк, не assertion). 10/10 подтверждается только суммой раздельных прогонов (`multi-final1.log` 4/4, `persist-run6.log` 3/3, `ops-reg4.log` 3/3). Заявление верно по существу, но сходимость в финальном полном прогоне не зелёная — стоит фиксировать честнее (флейк bootstrap-готовности сам по себе сигнал: 90 s на readiness).

## Конформанс контрактам

### API.md

| Пункт | Статус |
|---|---|
| §1 `ops_committed` событие (payload, publisher после commit, publish_nowait, full-save путь) | ✅ реализовано точно; publisher — `_legacy_main.py:4893-4932` после `_save_session_with_cas` в обоих handler'ах; ошибки публикации — лог, не 5xx |
| §1 inline-граница 50 (49/51) | ✅ `test_ops_committed_events.py:175-202` — реальные тесты обеих веток (прогнано, 10/10 suite) |
| §2 redis pub/sub fan-in (`pm:session-events`, best-effort, subscribe/unsubscribe) | ✅ `redis_client.py:148-181`, `session_event_bus.py:23-43`, `session_events.py:20-64`; отписка и cancel при закрытии стрима ✓; redis down → in-process (тест есть) |
| §3 идемпотентность доставки (opId-дедуп на write-пути, клиентские фильтры) | ⚠️ фильтры реализованы, но own-op-echo через **общий** journal ломает same-user cross-tab (MAJOR-1) |
| §4 presence `editingElementId` (валидация 422, active_users echo, TTL, leave снимает) | ✅ schema-validator `legacy_api.py:157-175`, storage upsert с пустой строкой = снятие, `list_session_presence` echo; backend-тесты 14/14 (suite в 64 passed) |
| §5 наследие: route-dedup, org-reload, re-embed ordering, reconnect applier, client-id create | ✅ всё подтверждено кодом/тестами (см. ниже); ⚠️ один call-site без org_id (NIT-1) |
| §6 обратная совместимость (409 payload, 200 формат не меняются) | ✅ diff этих путей не меняет wire-формат; openapi +4 строки только presence |

### UI.md

| Пункт | Статус |
|---|---|
| §1 persistence-модули, схема v1+v2, fallback без новых депов | ✅ `persistence/` существует, mock in-memory; upgrade-ветвление v1→v2 протестировано |
| §2 lifecycle: append→IDB→UI, pendingAck-детач, ack-eviction, version-reconciliation, fullSavePreserveFrom sentinel | ⚠️ детач/eviction/sentinel — ✅ верифицировано построчно; **version-reconciliation — BLOCKER-2** |
| §3 online-триггер, F1-backoff, xml/meta без изменений | ✅ `installOpsOutboxNetworkTriggers` ✓; `saveCoordinator.js` diff = 0 строк ✓; retryJitter-test есть |
| §4 consumer (own/stale/opId фильтры, remote apply, LWW→proposed, fetch+rebase) | ⚠️ фильтры/LWW/full-ветка ✅; **шаг replay remaining — BLOCKER-1**; own-echo — MAJOR-1 |
| §5 proposed-панель (apply/reject, без нативных диалогов) | ✅ `OpsProposedPanel.jsx`/`opsProposedModel.js`, requeue с новым opId; тесты есть |
| §6 индикатор двухсостояний | ✅ `saveStatusSlotModel.ops-local` + sublabel, тесты pass |
| §7 soft-lock badge | ✅ модель + heartbeat; расхождение тест/имплементация — MAJOR-2(б) |
| §8 entry-reconciliation hook | ✅ точка привязки после apiGetSession до snapshot-reconcile; fetch из payload-сессии (`_session_api_dump` несёт полный `bpmn_xml` — fetch sound); 4 ветки протестированы |

### TESTS.md

| Пункт | Статус |
|---|---|
| §1.1–1.4 persistence/outbox/reconciliation unit | ✅ 128/128 моим прогоном; RED-first следы в истории коммитов |
| §1.2 version-reconciliation тест | ⚠️ существует, но с воображаемой серверной арифметикой (B2) |
| §1.5 consumer/LWW | ⚠️ тесты на моках, реальный контракт «модель содержит pending» не проверяется (B1) |
| §2.1–2.2 backend suites | ✅ 64/64 моим прогоном (33+21+10), включая 49/51 и org-regression |
| §3 openapi | ✅ diff ровно 4 строки (присутствие поля editingElementId) |
| §4 e2e | ⚠️ persistence 3/3, multiuser 4/4, operations 3/3 — по артефактам подтверждено; multiuser — rename-only (MAJOR-3); final-all 9/10 с bootstrap-флейком (NIT-4); canvas-editing-stability 3/6 — честно отражено в EXEC как baseline-drift, моей независимой верификации нет |
| §5 бюджеты | ✅ по логам: тело 3722 B ≤10 kB; p95 138.8/204.3 <300 мс; coverage 20/20; longtask 0; putBpmn 0; IDB sync p95 0.20 мс ≤5 мс; commit p95 8.8–12.3 мс (async) |
| §4.4 live-uvicorn acceptance | ⚠️ acceptance.py — sound дизайн (org ≠ default, живой SSE-подписчик), самостоятельно не перегонял |

## Наследие step1 — статус по фактам

1. ✅ undo-sent-unacked residual: pendingAck-детач реален и корректен (`createSaveOutbox.js:478-479, 347-352, 640-668`); undo отправленной op → compensating-ветка (`:550-555`); регрессионный тест push→flush(hang)→undo→push→ack — в suite (128/128).
2. ✅ parent re-embed после SQL-CAS commit в ops-handler (`_legacy_main.py:5185-5203`), изолированный retry 3 с backoff внутри lock, `parent_synced` в ответе; PUT /bpmn сознательно не меняется (задокументировано).
3. ✅ dead keepalive-код удалён; grep-контракт-тест есть.
4. ✅ route-дубль удалён: ровно одна live-регистрация (проверено grep'ом + introspection-тест в suite).
5. ⚠️ manual full-save ack wipe → **BLOCKER-2**: заявленная version-based reconciliation несостоятельна по арифметике и теряет post-flight ops.
6. ✅ reconnect/create-op в vocabulary клиента и сервера; create replay идемпотентен по id (`opsRebase.js:94-99`), серверный create с клиентским id + collision → 422 (`ops_applier.py:380-394`).

## Регрессионный риск vs step1/F1/#989

- Echo suppression replay+remote: флаги проходят, commandToOps пропускает replay — ✅ (тесты commandToOps в 128/128).
- Dedup-ledger: `lastCapture` сброс на full-save ack (`createSaveOutbox.js:889`) и при маппинг-исключении — ✅.
- Drag coalesce `__coalesceCount` → undo coalesced → needsFullSave (step1 MAJOR-1) сохранён, тест на месте.
- Backoff xml/meta: `saveCoordinator.js` — 0 строк diff ✅.
- Presence для клиентов без editingElementId: поле опционально, отсутствие → null, валидация 422 не 500 ✅.
- 409-rebase путь step1 (#989 wire-поле `server_current_xml`) не сломан: чтение `conflictDetail.server_current_xml` первым кандидатом сохранено (`createSaveOutbox.js:688-698`).

## Итог

Backend-срез (publisher, fan-in, applier-reconnect, org-explicit CAS, re-embed ordering, route-dedup, presence) — качественный, претензий влияющих на корректность нет (NIT-1/3). Persistence-срез (journal, IDB-helper, гидрация, sentinel) — корректен. Два BLOCKER'а сидят в новой логике контура: шаг replay-remaining в consumer (B1) и reconciliation ручного full-save (B2) — оба дают молчаливую клиент/сервер дивергенцию/потерю, оба маскируются зелёными тестами, оба относятся к заявленной миссии контура (data-loss + multi-user convergence). MAJOR-1 (cross-tab same-user) нарушает явный пункт мультипользовательской модели PLAN §6.6. MAJOR-2 — регрессия тестов и недостоверный conformance-claim.

**Рекомендация:** исправить B1 (убрать/переделать шаг 7, добавить move-convergence тест), B2 (консервативное поведение manual ack + тесты с реальной серверной семантикой версии), MAJOR-1 (scope own-echo по собственному буферу), MAJOR-2 (починить/синхронизировать presence-тесты, пересчитать fail-set). После исправлений — повторное ревью. MAJOR-3 — вместе с фиксом B1. NIT'ы — по вкусу владельца. Merge/deploy — только после явного approve владельца; stage-верификация ключевых спеков post-merge обязательна (deferred в EXEC честно).


---

## Re-review (2026-09-16, fix commit 4fa6bfee)

> Верификационный проход по `4fa6bfee` (+424/−154, 14 файлов). Дисциплина та же: код-ридинг первичен, spot-check'и прогнаны самим ревьюером, отчётам не доверял.

### Вердикт: **APPROVE**

Оба BLOCKER'а и все MAJOR'ы исправлены по существу, регрессионные тесты реальные и усилены (не косметика), новые риски фиксов — NIT-уровня. Контур в merge-готовом состоянии по коду.

### Проверочная база (прогнано ревьюером)

| Прогон | Результат |
|---|---|
| `pytest tests/test_session_operations_api.py tests/test_ops_applier_parity.py tests/test_ops_committed_events.py -q` (`/tmp/step2-be-venv`) | **64 passed** + 3 subtests (20.9 s) |
| `node --test` все `*.test.mjs` в `opsOutbox/` | **132/132 pass** (было 128 — +4 новых теста механизма) |
| presence/stage-ui файлы (`useSessionPresence`, `presenceModel.softlock`, `softLockBus`, `sessionPresenceModel`, `saveStatusSlotModel.ops-local`, `opsProposedModel`) | **26/27 pass**; единственный fail — pre-existing ttl-60s (идентичен baseline, проверено в раунде 1) |
| `src/lib/api.operations-client-id.test.mjs` | 3/3 |
| Code-read fix-диффа целиком + проверка контракта `saveCoordinator.emit("status", …)`/`subscribe` (синглтон, `saveCoordinator.js:146-160,175,485`) и точки сериализации XML относительно busy/build (`createBpmnCoordinator.js:doFlush` → `persistRaw` → `saveRaw` → `execute`: сериализация ДО `_setPipelineStatus(busy/build)`, синхронная цепочка без await между ними) | sound |
| `e2e-runs/review-fix-multiuser-5of5.log` | 5/5, включая новый move-convergence (test 8) за 5.0 s |

### По-файндинг статус

| Finding | Статус | Доказательство |
|---|---|---|
| **BLOCKER-1** (replay pending на модели, уже содержащей правки) | **FIXED_VERIFIED** | Шаг 7 удалён (`opsRemoteApply.js` — replay-блока нет, `replayPendingOps` выпилен из deps/outbox-API; единственная оставшаяся ссылка — внутри `applyServerReconciliation` после `loadServerXml`, fetch+rebase-ветка, replay после полной перезагрузки модели — корректно). LWW-поток: incoming применяется до удаления losers; winning-op трогает элемент (updateProperties перезаписывает эффект loser'а; move — дельта поверх, loser в proposed согласно дизайну). Тесты усилены: `opsRemoteApply.test.mjs` ассертит **отсутствие** replay-вызова и сохранение pending в буфере (старые ассерты инвертированы в правильную сторону, не ослаблены). **E2E**: новый test 8 (`async-save-multiuser.spec.mjs:606`) — `toEqual` точных bounds у **обоих** клиентов + mid-flight single-apply ассерт ровно в окне B1 (позиция B = initial+1Δ, пока move B pending при событии A); под старым кодом дал бы 2Δ. Лог 5/5. Попутно найден и исправлен латентный баг: `replayOpsOnModeler` shape.move без `context.hints` (diagram-js `MoveShapeHandler` читает `hints.layout` без страховки) — hints `{layout:false, recurse:false}` для move, `{}` для create/reconnect (`opsRebase.js`) + регрессионный тест на контекст команды; parity с серверным applier (bounds-only) sound. |
| **BLOCKER-2** (version-арифметика + ack-wipe) | **FIXED_VERIFIED** | Version-математика (`base+sentCount`, `lastDispatchMeta`) полностью удалена. Новый механизм: снимок opId буфера на `status busy/stage:"build"` xml/rawXml без preserve → manual success снимает **ровно пересечение** буфера со снимком; `error` инвалидирует снимок; preserve-ветка (sentinel) побайтово неизменна. **Тайминг sound**: сериализация XML предшествует busy/build синхронной цепочкой без await (`doFlush` → `persistRaw` → `saveRaw` → `execute` — busy/build эмитится до первого await в execute) — op в буфере на момент снимка гарантированно в сериализованном XML; op после снимка не в XML и не drain'ится ⇒ уходит обычным flush. Оба направления гонки закрыты конструктивно. Livelock невозможен (нет restore+reflow-цикла; `sentCount>=2` — тест «drains exactly the busy-time snapshot» с ассертом `calls.length === 1`). Post-flight op выживает (opId-exact тест). Тесты — **характеризация реальности**: эмулируют реальную последовательность событий координатора (status busy/build → success/error), а не воображаемую wire-арифметику; старые тесты на удалённую математику корректно заменены. Подписка на status-events: per-outbox `coordinator.subscribe` с отпиской в `destroy()` (прежний паттерн), фильтр sessionId + pipeline до логики — leak/перекрёстное влияние инстансов нет; stage `"build"` эмитится один раз на прогон (ретраи — `"transport"`), снимок ретраями не перезаписывается. |
| **MAJOR-1** (own-echo через общий journal) | **FIXED_VERIFIED** | Фильтр строго `actor_client_id === ownClientId` (оба непустые); journal-membership проверка удалена. Пустой actor (API/external) — применяется. Тесты инвертированы правильно: «opIds в SHARED journal с чужим actor → applied», «empty actor → applied». |
| **MAJOR-2** (2 regressed presence-теста) | **FIXED_VERIFIED** | Единый контракт `editingElementId: … \|\| null` в обоих normalize; backend wire — null. Мой прогон 26/27; единственный fail — pre-existing ttl-60s (падал на baseline ещё в раунде 1). |
| **MAJOR-3** (rename-only e2e) | **FIXED_VERIFIED** | Move-convergence test 8: точные `toEqual` bounds обоих клиентов + mid-flight single-apply + бюджет ≤1 409 + ноль page errors. Усилен, не ослаблен. Лог 5/5. |
| **NIT-1** (org_id на clear-session) | **FIXED_VERIFIED** | `_legacy_main.py` — `org_id=getattr(s, "org_id", "") or get_default_org_id()`. Все 4 call-site `_save_session_with_cas` org-explicit. |
| **NIT-2** (телеметрия IDB-write failure) | **FIXED_VERIFIED** | `ops_journal_write_failed` one-shot diagnostic, try/catch вокруг телеметрии. |
| **NIT-3** (pubsub на стрим) / **NIT-4** (bootstrap-флейк) | NOT_FIXED (осознанно) | Архитектурное / инфраструктурное наблюдение, не блокирует. |

### Новые находки самих фиксов (NIT-уровня)

- **N-new-1 (NIT, узкий residual, pre-existing класс)**: in-flight ops (`pendingAck`) не входят в busy-time snapshot. Межливинг «manual full save во время полёта ops-батча, батч проигрывает гонку (409)» по-прежнему ведёт в `_onConflict` → `loadServerXml` (XML уже содержит эффекты ops) → replay → **симметричное двойное применение** (клиент 2Δ; сервер при повторной отправке тоже 2Δ — сходятся, но ход семантически удвоен). Окно: ручной save в ~150–300 мс полёта ops + проигрыш гонки; класс существует со step1; исход convergent, не silent divergence. Рекомендация (follow-up, не блокер): включать opId `pendingAck` в snapshot-множество — тогда 409-rebase после покрывшего full-save replay'ит пустой буфер.
- **N-new-2 (NIT)**: snapshot перезаписывается повторным `busy/build` до `success`/`error` предыдущего прогона (координатор сериализует flush'и — окно микроскопическое; чужой `error` сбросит снимок — консервативно в безопасную сторону: недо-drain безопасен по opId-идемпотентности, пере-drain невозможен). Достаточно документировать.

### Регрессионный свип после фиксов

- opsOutbox unit 132/132 (мой прогон), включая 4 новых теста снимка и инвертированные consumer-тесты; backend target suites 64 passed (мой прогон); presence/stage-ui 26/27 (1 pre-existing = baseline); `api.operations-client-id` 3/3.
- Синглтон-контракт `coordinator.subscribe/emit("status")` существует и используется по тому же паттерну, что `success`/`error` (`saveCoordinator.js:146-160,175,485,554,585`).
- Удалённый `outbox.replayPendingOps` — висячих вызовов нет (grep: единственная ссылка — `applyServerReconciliation`, fetch+rebase-ветка).

### Итог

Все findings раунда 1 закрыты верифицируемо, сопровождены усиленными регрессионными тестами, e2e multiuser 5/5 с точной геометрической сверкой. Остатки — NIT-уровня (N-new-1 — симметричный double-apply в узком окне, convergent, pre-existing класс; рекомендован в follow-up). Критерии приёмки PLAN §10 теперь проверяемы и подтверждены. **Merge — по явному approve владельца; stage-верификация ключевых спек post-merge (в т.ч. move-convergence test 8) — обязательна.**
