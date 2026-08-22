# AUDIT — Version Merge

## Проблема
При конфликте версий пользователю нужно подгрузить версию другого пользователя, но при этом сохранить свою текущую версию видимой (подсвеченной). Сейчас доступны только "Обновить сессию" (перезаписать локальное) или "Отбросить локальные изменения".

## Хранение версий
- Таблица `bpmn_versions` (`backend/app/storage.py`):
  - `id`, `session_id`, `org_id`, `version_number`, `diagram_state_version`, `bpmn_xml`, `session_payload_hash`, `session_version`, `source_action`, `created_at`, `created_by`.
- Уникальные индексы по `(session_id, version_number)` и `(session_id, diagram_state_version)`.
- Методы: `list_bpmn_versions`, `get_bpmn_version`, `create_bpmn_version_snapshot`.

## Endpoints
- `GET /api/sessions/{id}/bpmn/versions` — список версий.
- `GET /api/sessions/{id}/bpmn/versions/{version_id}` — одна версия с XML.
- `POST /api/sessions/{id}/bpmn/restore/{version_id}` — восстановление версии (перезапись текущей).
- `PUT /api/sessions/{id}/bpmn` — сохранение XML с CAS.

## BPMN-архитектура
- `bpmn-js@13.2.2` (CDN + динамические импорты `NavigatedViewer` / `Modeler`).
- `BpmnStage` держит `viewerRef` и `modelerRef`, обёрнутые в `createBpmnRuntime`.
- XML живёт в `createBpmnStore` (`xml`, `rev`, `dirty`, `lastSavedRev`).
- `useBpmnSync.js` синхронизирует XML с сессией.

## Существующие UI-паттерны
- **История версий** (`ProcessDialogs.jsx:232-407`): список версий, XML preview, download, restore, compare A/B.
- **Семантический diff** (`ProcessDialogs.jsx:409-531` + `semanticDiff.js`): таблица added/removed/changed по задачам/потокам/ланам; без визуального сравнения двух диаграмм.
- **Модал конфликта** (`ProcessStageSaveConflictModal.jsx`): обновить / остаться / отбросить.
- **Modal primitive** (`frontend/src/shared/ui/Modal.jsx`).

## Gaps
1. **Нет side-by-side просмотра** двух версий BPMN.
2. **Нет алгоритма merge** XML; `semanticDiff.js` только отчитывает об изменениях.
3. **Нет режима "загрузить как черновик"** — restore сразу перезаписывает и бампит `diagram_state_version`.
4. **Состояние хранит один XML**; для сравнения нужен второй слот (`candidateXml`).
5. **Restore endpoint** не сравнивает с текущим XML, просто заменяет.
6. **Нет action-кнопки "Слить"** в истории версий или в конфликтном модале.
7. **bpmn_meta** (hybrid, drawio, camunda, robot) тоже нужно учитывать при merge.

## Релевантные файлы
- `backend/app/storage.py` (`bpmn_versions`)
- `backend/app/_legacy_main.py` (restore, save)
- `backend/app/routers/sessions.py`
- `frontend/src/lib/api.js` (BPMN version API)
- `frontend/src/components/process/BpmnStage.jsx`
- `frontend/src/features/process/bpmn/runtime/createBpmnRuntime.js`
- `frontend/src/features/process/bpmn/store/createBpmnStore.js`
- `frontend/src/features/process/bpmn/diff/semanticDiff.js`
- `frontend/src/features/process/stage/ui/ProcessDialogs.jsx`
- `frontend/src/features/process/stage/ui/ProcessStageSaveConflictModal.jsx`
