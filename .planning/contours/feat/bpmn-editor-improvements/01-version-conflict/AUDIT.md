# AUDIT — Version Conflict Detection

## Проблема
Пользователь А открывает сессию и редактирует диаграмму. Пользователь Б сохраняет более новую версию. Пользователь А не получает своевременного уведомления и при своём сохранении перезаписывает изменения Б (получает 409 и только тогда видит конфликт).

## Как загружается сессия
- `GET /api/sessions/{id}` — основная загрузка (`routers/sessions.py` → `session_service.get_session`).
- `GET /api/sessions/{id}/meta` — мета-данные, включая `diagram_state_version`.
- `GET /api/sessions/{id}/bpmn` — экспорт XML.
- Фронт: `useSessionActivationOrchestration.js` → `apiGetSession` → `sessionToDraft` → `App.onSessionSync`.

## Как отслеживается версия
### Бэкенд
- Поля модели `Session` (`backend/app/models.py`):
  - `diagram_state_version` — монотонный CAS-счётчик.
  - `bpmn_xml_version`, `version`, `updated_at`.
  - `diagram_last_write_actor_user_id`, `diagram_last_write_actor_label`, `diagram_last_write_at`, `diagram_last_write_changed_keys`.
- `_require_diagram_cas_or_409` (`_legacy_main.py:987`) отдаёт 409 с богатым payload, если `base_diagram_state_version` не совпадает.
- `_mark_diagram_truth_write` инкрементирует версию и пишет автора/время.

### Фронтенд
- `diagramStateVersionRef` / `diagramStateVersionSidRef` в `ProcessStage.jsx`.
- `rememberMonotonicDiagramStateVersion` / `resolveDiagramBaseVersionForActiveSession` (`diagramVersionContext.js`).
- Каждый diagram-truth PATCH/PUT отправляет `base_diagram_state_version`.
- `sessionPatchCasCoordinator.js` и `createBpmnPersistence.js` обновляют локальную версию после успеха/конфликта.

## Существующий механизм оповещения
- `pollRemoteSessionSnapshot` (`ProcessStage.jsx:1632`) раз в 30 с вызывает `GET /api/sessions/{id}/bpmn/versions?limit=1`.
- При обнаружении более новой версии:
  - выставляет `remoteSaveHighlightView`;
  - показывает persistent toast с текстом "Обновите сессию, чтобы увидеть актуальную версию" и кнопкой "Обновить сессию";
  - `applyPendingRemoteSaveRefresh` загружает полную сессию через `apiGetSession`.
- Модал конфликта `ProcessStageSaveConflictModal` появляется только после неудачного сохранения (409).

## Найденные пробелы
1. **Оповещение опрашивающее и редкое** — 30 с; нет WebSocket/SSE.
2. **Опрос пропускается, когда у пользователя есть несохранённые изменения** — именно тогда предупреждение нужнее всего.
3. **Используется тяжёлый endpoint** (`bpmn/versions`) вместо лёгкого `meta`.
4. **Heartbeat присутствия не несёт версию** — `POST /api/sessions/{id}/presence` и так шлётся каждые 30 с.
5. **Нет упреждающего UI до попытки сохранения** — пользователь узнаёт о конфликте только по 409.
6. **Нет видимого счётчика/индикатора версии** в заголовке редактора.
7. **После успешного сохранения текущего пользователя `seenVersion` обновляется неявно**, что может замаскировать удалённое сохранение.

## Релевантные файлы
- `backend/app/_legacy_main.py` (CAS, last-write, version)
- `backend/app/services/session_service.py` (`get_session_meta`)
- `backend/app/routers/sessions.py`
- `frontend/src/components/ProcessStage.jsx`
- `frontend/src/features/process/stage/utils/sessionPatchCasCoordinator.js`
- `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js`
- `frontend/src/features/process/stage/ui/ProcessStageSaveConflictModal.jsx`
- `frontend/src/features/process/stage/ui/ProcessSaveAckToast.jsx`
