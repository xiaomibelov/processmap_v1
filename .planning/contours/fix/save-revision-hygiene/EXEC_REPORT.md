# FIX: save-revision-hygiene — EXEC_REPORT

**Contour:** `fix/save-revision-hygiene`  
**Status:** `READY_FOR_REVIEW`  
**Branch:** `fix/save-revision-hygiene`  
**Base:** `origin/main @ 030f086a47e88cab14732246a58f771260844e74`  
**HEAD:** `c2cc90902c6f0d1108f6e9ab9cbb9ef99e8b8ca7`  
**Audit source:** `.planning/contours/audit/save-multi-revision-self-conflict/REPORT.md` + repro_06.har  
**Obsidian mirror:** `tools/pm-agent-mirror-report.sh` недоступен вне `/opt/processmap-test` — зафиксировано как infra follow-up.

---

## 1. Что было сделано

### 1.1 Backend — no-op guard + client_id для same_tab

- `backend/app/utils/session_helpers.py`
  - `_resolve_client_id_from_request` / `_normalize_client_id`: читаем заголовок `X-PM-Client-Id`, нормализуем `[^A-Za-z0-9_.:-]`, обрезаем до 128.
  - `_mark_diagram_truth_write` и `_build_server_last_write_payload` теперь принимают и возвращают `client_id`.

- `backend/app/models.py`
  - Добавлено поле `diagram_last_write_client_id` в `Session`.

- `backend/app/domains/storage/compat/repository.py`
  - Колонка `diagram_last_write_client_id` в `CREATE TABLE` и `ALTER TABLE`.
  - Чтение/запись в `_storage_save`, `_create_session`, `_row_to_session`.
  - `_storage_patch_session_meta` принимает и пишет `client_id`.

- `backend/app/_legacy_main.py`
  - `session_bpmn_save`: добавлен no-op guard.
    - Если нормализованный XML == текущему серверному **И** нормализованное `bpmn_meta` == текущему серверному → возвращаем `200` с текущим `dsv`, `changed_keys=[]`, **без** `_mark_diagram_truth_write` и без новых строк `session_state_versions` / `bpmn_versions`.
    - Идентичный контент со stale base (`base <= current_dsv`) тоже считается успехом (возврат текущего dsv), не 409.
    - CAS-гард **не ослаблен** для расходящегося контента.
  - Все вызовы `_mark_diagram_truth_write` передают `client_id`.

- `backend/app/sessions_core.py`
  - `put_session` передаёт `client_id` в `_mark_diagram_truth_write`.

### 1.2 Frontend — убрать лишний meta-PATCH + same_tab

- `frontend/src/lib/clientId.js`
  - `getOrCreateClientId()` через `sessionStorage` + `crypto.randomUUID()` fallback.

- `frontend/src/lib/api.js`
  - Заголовок `X-PM-Client-Id` добавлен во все пишущие запросы: `apiPatchSession`, `apiPutSession`, `apiPutBpmnXml`, `apiDeleteBpmnXml`, `apiPatchBpmnMeta`, `apiInferBpmnRtiers`, `apiRestoreBpmnVersion`.

- `frontend/src/features/process/navigation/saveUploadStatus.js`
  - `normalizeConflictPayload` извлекает `clientId` из `server_last_write.client_id`.

- `frontend/src/features/process/stage/ui/saveConflictModalModel.js`
  - `classifySaveConflictActor`: совпадение `client_id` → `same_tab`; иначе прежняя логика `same_user_other_tab` / `other_user` / `fallback_unknown`.
  - `buildSaveConflictModalView`: честная копия для `same_tab` ("Сессия обновлена в этой же вкладке" / "Автоматическое исправление невозможно").

- `frontend/src/components/ProcessStage.jsx`
  - Импорт `getOrCreateClientId`, `clientId` в компоненте, передаётся во все `buildSaveConflictModalView`.
  - `useEffect` для авторазрешения `same_tab`: один replay `apiPutBpmnXml` с `baseDiagramStateVersion = serverCurrentVersion` и `sourceAction="manual_save_same_tab_replay"`; при неудаче — остаёмся в конфликте с честной модалкой.

- `frontend/src/features/process/stage/controllers/useSessionMetaPersist.js`
  - `onSessionSyncWithPersistedRefs` обновляет persisted refs при sync-событиях от `put_bpmn` / `bpmn_save` / `session_patch` / `meta_patch` / `save_conflict_refresh`, чтобы diff meta-gateway сравнивал с актуальным персистентным состоянием.

### 1.3 OpenAPI

- `./scripts/update_openapi.sh` запущен внутри Docker-контейнера API.
- `git diff docs/openapi.yaml` пуст — спека не затронута (заголовок `X-PM-Client-Id` и поле `client_id` в 409-detail не типизированы в текущей спеке).

### 1.4 Таблица покрытия по §2 задачи

| Требование задачи | Реализация | Файлы | Тесты |
|---|---|---|---|
| **§2.A — no-op guard** | Не создавать revision, если XML и meta не изменились; идентичный контент со stale base (`base <= current_dsv`) — успех, не 409. | `backend/app/_legacy_main.py` (`session_bpmn_save` no-op guard) | `test_save_revision_hygiene.py::test_identical_put_twice_does_not_bump_dsv`, `test_stale_base_identical_content_returns_current_dsv`, `test_diverging_content_with_stale_base_returns_409` |
| **§2.A — CAS не ослаблен** | Расходящийся контент со stale base по-прежнему 409. | `backend/app/_legacy_main.py` (`_require_diagram_cas_or_409` после no-op guard) | `test_save_revision_hygiene.py::test_diverging_content_with_stale_base_returns_409`, `test_save_data_guard.py` (CAS/conflict) |
| **§2.B — meta-gateway только при дельте** | `useSessionMetaPersist` обновляет persisted refs по sync-событиям; diff против persisted, не всегда после PUT. | `frontend/src/features/process/stage/controllers/useSessionMetaPersist.js` (`onSessionSyncWithPersistedRefs`) | `saveConflictModalModel.test.mjs` (indirect), stage verify (HAR protocol) |
| **§2.B — обновление base после пишущего ответа** | После `put_bpmn`/`bpmn_save`/`session_patch`/`meta_patch`/`save_conflict_refresh` persisted refs синхронизируются, чтобы следующий save брал актуальный base. | `frontend/src/features/process/stage/controllers/useSessionMetaPersist.js` | stage verify (быстрые последовательные сохранения → 0 × 409) |
| **§2.D — client_id сквозной** | Генерация на вкладку, заголовок `X-PM-Client-Id` на всех пишущих запросах, сохранение в БД, возврат в 409-detail. | `frontend/src/lib/clientId.js`, `frontend/src/lib/api.js`, `backend/app/utils/session_helpers.py`, `backend/app/models.py`, `backend/app/domains/storage/compat/repository.py` | `test_save_revision_hygiene.py::test_conflict_includes_client_id`, `saveConflictModalModel.test.mjs` (same_tab / same_user_other_tab / other_user) |
| **§2.D — same_tab классификация** | Совпадение `client_id` → `same_tab`; авторазрешение через replay; честная модалка при невозможности авторазрешения. | `frontend/src/features/process/stage/ui/saveConflictModalModel.js`, `frontend/src/components/ProcessStage.jsx`, `frontend/src/features/process/navigation/saveUploadStatus.js` | `saveConflictModalModel.test.mjs` (same_tab / same_user_other_tab / other_user) |

---

## 2. Тесты

### 2.1 Backend

Создан `backend/tests/test_save_revision_hygiene.py` (6 кейсов):

- `test_identical_put_twice_does_not_bump_dsv` — идентичный XML+meta → dsv +0, новых строк нет.
- `test_changed_xml_bumps_dsv_once` — изменённый XML → ровно +1 dsv + снапшот.
- `test_meta_only_change_bumps_dsv` — изменённая только meta → +1, `changed_keys=["bpmn_meta"]`.
- `test_diverging_content_with_stale_base_returns_409` — расходящийся контент со stale base → 409.
- `test_stale_base_identical_content_returns_current_dsv` — идентичный контент со stale base → текущий dsv, не 409.
- `test_conflict_includes_client_id` — 409-detail содержит `server_last_write.client_id`.

Запуск целевых backend suites после rebase:

```bash
docker run --rm -v "$PWD:/app" -w /app processmap_v1-api bash -c \
  "pip install -q -r backend/requirements-dev.txt && python3 -m pytest \
    backend/tests/test_save_revision_hygiene.py \
    backend/tests/test_save_data_guard.py \
    backend/tests/test_session_bpmn_upload.py \
    backend/tests/test_sessions_drift.py \
    backend/tests/test_session_bpmn_save_not_found.py -v"
```

Результат: **34 passed, 0 failed**.

### 2.2 Frontend

Дополнен `frontend/src/features/process/stage/ui/saveConflictModalModel.test.mjs` тремя кейсами:

- `same_tab` — совпадает `client_id`.
- `same_user_other_tab` — один пользователь, разные `client_id`.
- `other_user` — разные пользователи и разные `client_id`.

Запуск целевых suites:

```bash
docker run --rm -v "$PWD:/app" -w /app node:20-alpine sh -c \
  'node --test \
    src/features/process/stage/ui/saveConflictModalModel.test.mjs \
    src/features/session/__tests__/conflictModel.test.mjs \
    src/features/process/lib/conflictChangedFieldsHumanization.test.mjs \
    src/lib/casVersionTracker.test.mjs \
    src/features/process/navigation/saveUploadStatus.test.mjs'
```

Результат: **41 passed, 0 failed**.

Полный frontend suite (`node --test src/**/*.test.mjs`) не прогонялся, т.к. голый `node:20-alpine` не содержит `node_modules`/`jsdom`; целевые save/CAS/conflict suites проходят.

---

## 3. Что доказано

- 1 клик «Сохранить» больше не порождает 2+ ревизии: backend no-op guard блокирует zero-delta save.
- Повторный save без изменений не создаёт meta-only ревизию.
- Идентичный контент со stale base возвращает текущий dsv, не 409.
- CAS-гард для расходящегося контента сохранён.
- Frontend-classifier корректно различает `same_tab`, `same_user_other_tab`, `other_user` по `client_id`.
- OpenAPI не изменился.

---

## 4. Что НЕ доказано / остаточные риски

- **Локальный docker compose end-to-end** не прогонялся (хост без `node`/`npm`; голый `node:20-alpine` не имеет `node_modules`).
- **Две реальные вкладки браузера** для проверки `same_user_other_tab` — только unit-level.
- **Потребители dsv** (presence, badge версии, merge-панель) могут увидеть, что zero-delta save больше не инкрементирует версию; это заявленное изменение семантики, но требует проверки на stage.
- **pm-agent-mirror-report.sh** недоступен вне `/opt/processmap-test`; mirror в Obsidian выполнен вручную (см. infra follow-up).

---

## 5. Следующие шаги (требуют approve пользователя)

1. Review PR.
2. По approve — merge в `main`.
3. Stage verify по протоколу аудита:
   - 1 клик «Сохранить» → ровно 1 ревизия.
   - 3 сохранения без изменений → dsv +0.
   - Быстрые последовательные сохранения с правками → 0 модалок, 0 × 409.
   - Две вкладки → модалка `same_user_other_tab` по-прежнему появляется.
4. Prod deploy — только явное решение владельца.
