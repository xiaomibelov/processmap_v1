# TESTS.md — матрица тестов контура

Дисциплина: TDD (RED → GREEN → REFACTOR). Никакого production-кода без падающего теста. Тесты пишутся первыми в каждом под-контуре.

## 1. Unit (frontend, node:test — `npm test`, стиль соседних *.test.mjs)

### 1.1 `commandToOps.test.mjs` (RED первым)
- `element.updateProperties` command → 1 op, корректный payload.
- `shape.move` drag-шторм (5 команд подряд, одна сессия) → coalesce → 1 keep-last op.
- undo ещё не ушедшей op → op удаляется из буфера; undo ушедшей → compensating-op.
- не-whitelisted команда (spaceTool, lane.resize) → `needsFullSave`, op не создаётся.

### 1.2 `createSaveOutbox.test.mjs`
- debounce: flush ровно один раз после серии правок + 2.5 s; нет flush при тишине.
- порог: 50 ops → немедленный flush без ожидания debounce.
- порядок opId стабилен; uuid уникальны.
- 200 ack: буфер очищен, `casVersionTracker` bumped ровно на 1, индикатор-событие emitted.
- повторный flush после retry: те же opId (идемпотентность клиента).
- visibilitychange=hidden → немедленный flush; beforeunload → keepalive-fetch (mock: заголовки Authorization присутствуют — регрессия против sendBeacon).
- mutual exclusion: full-save flush и ops flush не пересекаются (per-session queue).

### 1.3 `opsRebase.test.mjs`
- 409 → adopt server version, replay pendingOps через applyOps-мок; применённые команды возвращаются в staging с **теми же opId**.
- fuzzy-match (element не найден по id) → `needsFullSave`.
- двойной 409 подряд → `ops-degraded`, full-save путь.

## 2. Unit (backend, pytest — `backend/tests/`, стиль test_diagram_cas_guard.py)

### 2.1 `test_session_operations_api.py`
Фикстуры по образцу `conftest.py:36-59` (temp SQLite) + `create_access_token` auth.

- **happy path**: seed сессия (diagram_state_version=N), батч 3 ops → 200, `version=N+1`, XML изменён ровно по ops; `updated_at` обновлён; trace в `session_state_versions`.
- **идемпотентность**: повтор той же телом (те же opId) → 200, `version=N+1` (без инкремента), `applied:0, skipped:3`; XML неизменен.
- **частичный retry**: батч A (opId 1,2) применён; retry с opId 2,3 → opId 2 skip, opId 3 apply, один инкремент.
- **409 baseVersion mismatch**: 409, `server_current_version`, `server_current_xml` — валидный XML, совпадает с хранимым.
- **409 без baseVersion**: `DIAGRAM_STATE_BASE_VERSION_REQUIRED`.
- **422 невалидный op**: неизвестный type / payload без elementId / elementId не существует в XML → 422 с `opId`, **весь батч откатился** (XML и version неизменны, в `session_applied_ops` нет строк).
- **транзакционность**: батч из [валидная op, невалидная op] → version и XML как до батча.
- **блокировки**: занятый Redis lock → 423 (фейк-редис по образцу test_bpmn_put_redis_lock.py).
- **CAS race**: две конкурентные обработки с одним baseVersion → ровно один 200, один 409.
- **whitelist-валидация каждого типа op** из API.md §5 (create/move/resize/delete connection/shape, updateProperties, updateDi) — golden apply на фикстурном XML.

### 2.2 `test_ops_applier_parity.py`
- golden parity: на 3+ реальных XML (включая схему 300+ элементов из фикстур/e2e-ассета): результат apply(ops) == load(xml) → те же правки через bpmn-js-клиентский путь. Проверка семантической эквивалентности (canonical XML compare, не byte-compare).
- DI-инварианты: после move/resize каждый семантический элемент имеет ровно соответствующий DI; waypoints connection сохранены.

## 3. API / spec

- `./scripts/update_openapi.sh` → `0 errors`; `docs/openapi.yaml` содержит `/api/sessions/{session_id}/operations`.
- schemathesis contract suite (`pytest -m contract tests/contract`) — зелёная (новый endpoint покрывается автоматически).

## 4. E2E (playwright, `frontend/e2e/async-save-operations.spec.mjs` — новый)

Сценарий «критерий приёмки»:
1. Seed сессия 300+ элементов (фикстура через API, готовый большой BPMN).
2. Авторизация, открытие сессии; `window.__FPC_E2E_PAUSE_AUTOSAVE__` не используем — правим реально.
3. 20 правок подряд (rename, move, create, delete, connection) с короткими интервалами.
4. Ассерты:
   - В performance-логе **ни одного** `PUT /api/sessions/*/bpmn` и ни одного save-XML body >10 kB; записи — только `POST .../operations`, тело каждого ≤10 kB.
   - Время ответа `operations` <300 ms (p95 по записанным).
   - Нет longtask >200 ms во время серии правок (PerformanceObserver в spec).
   - После ожидания финального flush: reload страницы → диаграмма содержит все 20 правок (сверка через API/XML), `diagram_state_version` инкрементирован корректно.
5. Под-сценарий 409: принудительный race (через API правка из «другого клиента» между base и flush) → rebase автоматический, правки не потеряны, модал конфликта не показан.
6. Под-сценарий fallback: правка spaceTool → ровно один полный `PUT /bpmn`, после ack ops-флаши продолжаются.

Запуск: dev-стек (`docker compose up`) + `npm run test:e2e` (baseURL 127.0.0.1:5177, single worker, как существующие specs).

## 5. Регрессионные прогоны (обязательные перед PR)

- Backend: `cd backend && python -m pytest tests -q "не -m contract"` — зелёное (внимание: известные pre-existing red-базelines B9/B13 фиксируются до старта, в отчёте раздельно).
- Frontend unit: `npm test` — зелёное.
- Существующие save-e2e: `canvas-editing-stability.spec.mjs`, `canvas-heavy-editing.spec.mjs`, `bpmn-runtime-reliability.spec.mjs`, `canvas-optimization-v2-smoke.spec.mjs` — зелёные (контракты full-save не меняются).
- `verify-deploy.sh` → MATCH (если требуется контуром деплоя-скриптов — нет, вне скоупа).

## 6. Бюджет приёмки (фиксируется в EXEC_REPORT)

| Метрика | Бюджет | Где измеряется |
|---|---|---|
| Тело operations-запроса | ≤10 kB | e2e performance log |
| Ответ operations | <300 ms p95 | e2e |
| Longtask на правку | ≤200 ms | e2e PerformanceObserver |
| Full XML в Network за серию правок | 0 (кроме fallback-сценария) | e2e |
