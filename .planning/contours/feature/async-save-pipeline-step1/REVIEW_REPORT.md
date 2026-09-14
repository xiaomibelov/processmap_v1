---
contour: feature/async-save-pipeline-step1
role: reviewer
agent: Agent 3
date: 2026-09-15
verdict: CHANGES_REQUESTED
blockers: 2
majors: 3
---

# REVIEW_REPORT — feature/async-save-pipeline-step1 (Agent 3, Reviewer)

> Дата: 2026-09-15. Ревьюер: Agent 3. Baseline ревью: `git diff origin/main...HEAD` (7 коммитов, b8285741..b00a8a4f).
> Дисциплина: receiving-code-review — все утверждения проверены против кода, отчётам не доверял.
> Ревьюер read-only: код не изменялся.

## Вердикт: **CHANGES_REQUESTED**

Два BLOCKER'а во фронтенд-контуре: оба дают **молчаливую дивергенцию клиент/сервер** — ровно то, против чего построен контур. Оба маскируются существующими тестами. Бэкенд-срез (applier, route, идемпотентность, транзакционность) — качественный, претензий, влияющих на корректность, нет.

## Проверочная база (что реально прогнано)

| Прогон | Результат |
|---|---|
| `pytest tests/test_session_operations_api.py tests/test_ops_applier_parity.py` (docker python:3.11-slim, полный requirements.txt) | **30 passed** (+3 subtests) — заявленные 30/30 подтверждены |
| `node --test` 6 контурных frontend-файлов (commandToOps/createSaveOutbox/opsRebase/saveStatusSlotModel.ops-stages/useDiagramMutationLifecycle.ops-dedup/bpmnWiring) | **68/68 pass** |
| Полный frontend `npm test` на ветке | 3695 тестов: 3612 pass, **79 fail** |
| Полный frontend `npm test` на `origin/main` @ b8285741 (temp worktree, сравнение baseline) | 3631 тестов: 3548 pass, **79 fail** — ровно те же 79 (pre-existing baseline drift, ветка не причём) |
| Регистрация маршрута | Продовый entrypoint (`backend.app.main:app` → `create_app`) обслуживает router-вариант `routers/sessions.py:243` → `session_service.operations_apply` → `_legacy_main.session_operations_apply`. Тесты используют тот же `app.main:app` — тестируется живой путь. |

Регрессий фронтенд-юнитов ветка не добавляет (+64 теста, все зелёные; 79 красных — предсуществующие на baseline).

## Findings

### BLOCKER-1. 409-rebase читает несуществующее поле XML → двойное применение delta-ops → дивергенция

- **Где:** `frontend/src/features/process/bpmn/save/opsOutbox/createSaveOutbox.js:432`
- **Факт:** сервер в 409-detail шлёт `server_current_xml` (`_diagram_state_conflict_payload` + `_conflict_with_current_xml`, `backend/app/_legacy_main.py:4831-4850`, поле — `session_helpers.py:118-132`). Код читает:
  ```js
  const serverXml = response?.data?.detail?.current_xml || response?.currentXml || response?.data?.currentXml || null;
  ```
  Ни одна из трёх веток не совпадает с реальным wire (`data.detail.server_current_xml`) → `serverXml === null` → `loadServerXml` пропускается → `rebase.handleConflict` replay'ит `pendingOps` через `commandStack.execute` (`opsRebase.js:167-180`) на modeler, который **уже содержит эти правки**. `element.updateProperties` идемпотентен, но `shape.move` (delta) и `element.updateDi`-bounds применяются **второй раз** → канвас уезжает на лишний delta. Повторный flush уходит с теми же opId → сервер применяет ops один раз к серверному XML → клиент и сервер расходятся навсегда (индикатор при этом «сохранено»).
- **Почему тесты зелёные:** тесты используют выдуманное поле `current_xml` — `createSaveOutbox.test.mjs:485,523,558,617`, `opsRebase.test.mjs:69,92`. Они доказывают контракт, которого нет на wire. E2E-под-сценарий 409 (`e2e/async-save-operations.spec.mjs:555`) правит **rename** (идемпотентен при двойном применении) — маскирует баг.
- **Фикс:** читать `response?.data?.detail?.server_current_xml` (+ дефолт-путь через `readConflictServerCurrentVersion`-стиль резолвера). Если XML в 409 нет — **не replay'ить**, а сразу `degrade("rebase-no-xml")` (replay без загрузки серверного документа принципиально небезопасен для delta-ops). Регрессионный тест — с реальным полем и move-op в pending (ассерт: позиция не удваивается). Попутно: doc-comment в `lib/api.js:1989-1995` описывает 409 как `{currentVersion, currentXml}` — та же ошибка именования, источник бага; привести к API.md §2.

### BLOCKER-2. `_onAck` чистит весь буфер → ops, добавленные во время полёта flush'а, теряются без отправки

- **Где:** `createSaveOutbox.js:412-418` (`_onAck` → `clearBuffer()`), против `createSaveOutbox.js:277-290` (`flushNow` снимает `wireOps = buffer.map(...)` и уходит в координатор, `inFlight = true`).
- **Факт:** `pushCommand` не запрещён при `inFlight === true` — пользователь правит диаграмму, пока запрос в полёте (это нормальный режим работы, canvas не блокируется). Такие ops дописываются в тот же `buffer`. По ack `_onAck` делает `clearBuffer()` и `needsFullSave = false` — дописанные ops **удалены без отправки**, pending full-save-сигнал сброшен. Сервера никогда не увидит этих правок: молчаливая потеря дельт.
- **Теста нет:** матрица `createSaveOutbox.test.mjs` покрывает debounce/порог/ack/retry/409, но сценария «push во время полёта → ack → op доживает до следующего flush» нет.
- **Фикс:** на диспетчеризации зафиксировать список/количество реально отправленных ops (например `pendingAck = buffer.splice(0, sentCount)` или sentinel-операция); `_onAck` удаляет только отправленные; `needsFullSave` не сбрасывать, если выставлен после диспетчеризации. Тест: push → flush (transport-мок с ручным resolve) → push ещё → resolve ack → второй op обязан уйти следующим flush'ем.

### MAJOR-1. Undo coalesced-op вырезает всю слитую op → потеря delta более ранних команд

- **Где:** `createSaveOutbox.js:325-337` (undo-ветка `buffer.splice(index, 1)`), coalesce — `opsBatchSerializer.js:23-38`.
- **Факт:** `tryCoalesceIntoBuffer` не помечает, сколько команд слито в op (keep-last по `(type, elementId)` в окне 400 мс). Сценарий: drag A→B (op1), drag B→C в пределах окна (слилось в op1, финальный delta A→C), Ctrl+Z (откат только второй команды, канвас на B). Undo-ветка находит op1 по ключу и **вырезает её целиком** → ни один move не уходит на сервер → сервер остаётся на A, клиент на B. Дивергенция до ближайшего полного save (которого может не быть: команда whitelisted, dedup подавит full-save).
- **Фикс:** помечать слитые ops (`__coalesceCount`), undo по op с count > 1 → `needsFullSave` (консервативно) либо компенсирующая op только при count === 1. Тест: два move в окне, undo, flush → серверное состояние == клиентскому.

### MAJOR-2. Нет EXEC_REPORT.md — бюджеты приёмки и регрессионные прогоны не зафиксированы

- **Где:** `.planning/contours/feature/async-save-pipeline-step1/` — файла нет; при этом `PR.md` («Метрики: см. TESTS.md §6 / EXEC_REPORT.md») и `e2e/async-save-operations.spec.mjs:26` («См. EXEC_REPORT») на него ссылаются.
- **Факт:** PLAN §11 и TESTS.md §6 требуют фактические значения coverage (`mapped/total ≥ 0.95`), p95 <300 мс, longtask ≤200 мс, «0 full XML в сети», а также обязательные регрессионные прогоны (TESTS.md §5: полный backend pytest, `canvas-editing-stability` и др. save-e2e). Никаких следов прогонов e2e-спеки в контуре нет. Критерии приёмки PLAN §9 (п.1–6) непроверяемы.
- **Фикс:** прогнать e2e-спеку на dev-стеке + регрессионные прогоны, записать EXEC_REPORT.md с фактическими числами (включая coverage-ratio). Без этого PR не открывать.

### MAJOR-3. Нет теста RBAC/отрицательных путей нового route

- Auth-guard нового handler идентичен `session_bpmn_save` (проверено построчно: `_legacy_main.py:4862-4871` vs `:4620-4629`; lock/CAS-резолверы общие) — это хорошо. Но тестов на 403 (viewer/чужой org), 401 (без токена), 404 (несуществующая сессия) в `test_session_operations_api.py` нет — регрессионной страховки на новый write-endpoint нет. Добавить минимум 403-viewer и 404.

### NIT-1. Порядок parent re-embed расходится с API.md §3

- **Где:** `_legacy_main.py:~4990-5030` (parent sync **до** `_save_session_with_cas`), API.md §3 описывает шаг 11 после storage.save.
- При child SQL-CAS 409 parent уже перезаписан новым child-XML, а child-строка — нет (transient parent/child divergence). Порядок зеркалит существующий `session_bpmn_save` (тот же, предсуществующий паттерн) — не блокер, но API.md §3 стоит привести к факту или явно задокументировать отступление.

### NIT-2. Dead code в контурных модулях

- `isWithinKeepaliveBudget` (`opsBatchSerializer.js:56-58`), `keepaliveBodyLimitBytes` и `pageHideDrainTimeoutMs` (`opsOutboxConfig.js`) нигде не используются (ни в src, ни в тестах). UI.md §7 обещает проверку keepalive-бюджета (~64 kB) — не реализована. Либо реализовать (размер считается уже в `buildBatchBody`), либо удалить.

### NIT-3. Дублирующий opId внутри одного батча → 409 SESSION_WRITE_CONFLICT вместо 422

- **Где:** `legacy_api.py:332-352` (валидатор не проверяет уникальность opId в батче) → двойной INSERT в `repository.py:5725-5746` → integrity error → 409 без `server_current_version` (`session_helpers.py:297-307`).
- Не 500 (integrity маппится корректно), транзакция откатывается — безопасно, но семантически это невалидный payload клиента. Добавить проверку уникальности opId в `SessionOperationsIn._validate_operations` → 422.

### NIT-4. Doc-drift и косметика

- `lib/api.js:1989-1995`: doc-comment 409 `{code, currentVersion, currentXml}` ≠ реальный wire (`detail.server_current_version/server_current_xml`, API.md §2) — источник BLOCKER-1.
- `docs/openapi.yaml:18120+`: description операции `/operations` — шаблонная копия («Создать/выполнить сессию процесса…»), не описывает операцию.
- Двойная регистрация маршрута (`_legacy_main.py:4846` `@app.post` + `routers/sessions.py:243` `@router.post`): в проде живёт router-вариант, legacy-app не обслуживается entrypoint'ом; оба ведут в одну функцию. При завершении миграции routes — убрать legacy-копию.
- `ops_applier.py:280-290`: `element.updateProperties` разрешает записать атрибут `id` (смена id элемента опом). Клиент такого не шлёт; заблэклистить поле `id` на сервере защитно.

### Что проверено и НЕ является дефектом (ложные тревоги ревьюера)

- «`readAckDiagramStateVersion` не читает `version` из 200-ответа /operations» — ложная тревога: `apiPostSessionOperations` маппит `version` → `diagramStateVersion` (`lib/api.js:2047,2058`), а `readAckDiagramStateVersion` читает `diagramStateVersion` — CAS-bump трекера на ack работает.
- «storage-методы `list_applied_op_ids`/`cleanup_applied_ops` не приаттачены» — ложная тревога: `_attach_compat_methods(Storage, "_storage_", ...)` в `app/storage.py:71` аттачит все `_storage_*` автоматически.
- « IntegrityError на INSERT applied_ops даст 500» — маппится в 409 SESSION_WRITE_CONFLICT (`session_helpers.py:297-307`).

## Чек-лист конформанса контрактам

### API.md

| Пункт | Статус |
|---|---|
| §1 endpoint + тонкий route / applier-модуль | ✅ (router + `ops_applier.py`; legacy-дубль — NIT-4) |
| §2 схема (baseVersion, 1..200 ops, opId/type обяз.) | ✅ `SessionOperationsIn`; 409 payload `{code, client_base_version, server_current_version, server_last_write, server_current_xml}` — точно по контракту |
| §2 replay-all → 200 `{version: current, applied: 0, skipped: n}` без инкремента | ✅ реализовано fast-path'ем ДО CAS (осознанно, по контракту), тест `test_idempotent_replay_does_not_increment_version` |
| §3 порядок обработки (lock → CAS → idempotency-filter → parse-once → apply → re-serialize → truth-write → SQL-CAS + applied_ops + trace одной транзакцией → snapshot → parent re-embed → RAG hook) | ✅ кроме порядка parent re-embed (NIT-1); транзакционность подтверждена кодом (`repository.py:5725-5774`, единый `con.commit()`, rollback при CAS-fail) и тестами |
| §4 DDL / unique PK / index applied_at / TTL 30d / celery daily + lazy ~1/200 | ✅ DDL идентичен контракту; beat-задача `celery_app.py:24-29`; lazy-fallback в handler; тесты cleanup + lazy-probability |
| §5 whitelist 8 типов | ✅ все реализованы; сервер дополнительно принимает wire-алиасы (`delta`, `bounds`, `elementType`, `elementId`-для-connection) — суперсет, обоснован и покрыт parity-тестом |
| §6 OpenAPI регенерация | ✅ `/api/sessions/{session_id}/operations` в `docs/openapi.yaml`; claim «redocly lint 0 errors» — принят по коммит-сообщению (не перепроверялся) |

### UI.md

| Пункт | Статус |
|---|---|
| §1 SaveOutbox как 4-й pipeline в saveCoordinator, без своей очереди | ✅ динамическая регистрация (`createSaveOutbox.js:82-120`), retry/abort/conflict-gate координатора |
| §2 единый каскад commandStack.changed, без второй подписки | ✅ fan-out в `bpmnWiring.js:271-281`; порядок `pushCommand` ДО `emitDiagramMutation` — behavioral-тест `bpmnWiring.test.mjs:254-294` |
| §3 flush-триггеры (2.5 s debounce / 50 ops / hidden / beforeunload+pagehide) | ✅ + keepalive-fetch с Authorization (тест), НЕ sendBeacon |
| §4 маппинг whitelist / undo: не ушедшая → удалить из буфера, ушедшая → compensating | ✅ реализовано; **но undo coalesced-op — дефект (MAJOR-1)** |
| §4.1 echo suppression (`__pmOpSource: "replay"` → пропуск, счётчики не растут) | ✅ флаги проходят через runtime-снапшот (`createBpmnRuntime.js:141-142`), тесты есть |
| §5 rebase: adopt version → load currentXml → replay с сохранением opId → resume | ⚠️ структура есть, replay через `commandStack.execute` вместо `applyOps` — **документированное отступление** в шапке `opsRebase.js:11-16` (applyOps не покрывает command-derived типы) — обосновано; create-ops не replay'ятся → needsFullSave (сверхосторожно, ок). **Поле XML читается с неверным именем — BLOCKER-1** |
| §6 деградация (422 / double-409 / transport → ops-degraded до reload, без авто-reload) | ✅ `degrade()` + full-save fallback; conflict gate поднимается корректно |
| §7 keepalive вместо sendBeacon | ✅; бюджет 64 kB не enforced (NIT-2) |
| §8 бюджеты/инварианты | ⚠️ e2e-ассерты написаны; фактических значений нет (MAJOR-2) |

### TESTS.md

| Пункт | Статус |
|---|---|
| §1.1 commandToOps (маппинг, coalesce ≤400 мс, mouseup-commit, undo, coverage-счётчик) | ✅ тесты есть и зелёные (RED-first по истории коммитов) |
| §1.2 createSaveOutbox (debounce/порог/ack/retry/keepalive/mutual exclusion/echo/source/dedup) | ✅ 19 тестов; **гэп: in-flight race (BLOCKER-2), реальное поле 409 (BLOCKER-1)** |
| §1.3 opsRebase (adopt/replay/fuzzy/double-409) | ✅ есть; **тесты используют несуществующее поле `current_xml` (BLOCKER-1)** |
| §2.1 API-матрица | ✅ все 17 пунктов реализованы и проходят; гэпы: 403/401/404, duplicate opId (MAJOR-3, NIT-3) |
| §2.2 parity (canonical equivalence, DI-инварианты, 300+ элементов) | ✅ 13 тестов на 3 реальных фикстурах + synthetic 300+; 300+ только синтетический (NIT в духе TESTS.md §2.2) |
| §3 spec / contract suite | ✅ openapi обновлён; schemathesis-прогон не зафиксирован (MAJOR-2) |
| §4 e2e-спека | ✅ написана (3 теста, включая 409-race и fallback); следов прогона нет (MAJOR-2); 409-сценарий rename-only → не ловит double-apply (BLOCKER-1) |
| §5 регрессионные прогоны | ⚠️ frontend unit baseline сравнён (79 pre-existing fail = 79 на ветке, регрессий нет); полный backend pytest и save-e2e не зафиксированы (MAJOR-2) |
| §6 бюджеты приёмки | ⚠️ нет EXEC_REPORT (MAJOR-2) |

## Список тест-гэпов (итог)

1. 409-rebase с **реальным** полем `server_current_xml` + pending move-op → позиция не удваивается (регрессия BLOCKER-1).
2. Ops, добавленные во время полёта flush, переживают ack (регрессия BLOCKER-2).
3. Undo после coalesced drag (MAJOR-1).
4. RBAC: viewer → 403, без токена → 401, чужая сессия → 404 (MAJOR-3).
5. Дублирующий opId в батче → 422 (NIT-3).
6. E2E 409-под-сценарий с move/resize-op (сейчас rename-only).
7. Parity на реальном (не synthetic) XML ≥300 элементов.
8. Keepalive-бюджет либо тест, либо удаление (NIT-2).
9. EXEC_REPORT.md: coverage-ratio, p95, longtask, регрессионные прогоны (TESTS.md §5).

## Итог по срезам

- **Backend (route/applier/storage/celery):** конформанс API.md высокий, транзакционность и идемпотентность доказаны кодом и 30/30 тестами. Замечания только NIT-уровня (NIT-1, NIT-3, NIT-4).
- **Frontend outbox:** архитектура (4-й pipeline, echo suppression, dedup-ledger, keepalive) соответствует UI.md, тестовая дисциплина хорошая — но два BLOCKER'а в жизненном цикле buffer'а (ack-wipe, 409-field) делают контур непригодным для merge: оба пути (успешный flush с правками в полёте, и 409-rebase) дают молчаливую дивергенцию.
- **Процесс:** без EXEC_REPORT и следов e2e/регрессионных прогонов критерии приёмки PLAN §9 непроверяемы.

**Рекомендация:** исправить BLOCKER-1/2 + MAJOR-1 (минимальный набор для корректности), дописать регрессионные тесты из списка, прогнать e2e + регрессии, записать EXEC_REPORT — затем повторное ревью. MAJOR-2/3 — обязательны до открытия PR, могут идти параллельно.
