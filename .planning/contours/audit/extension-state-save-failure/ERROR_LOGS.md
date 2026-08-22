# ERROR_LOGS.md — известные ошибки и их места

## User-facing сообщения (UI)

| Сообщение | Где в коде | Когда |
|---|---|---|
| "Не удалось сохранить extension-state. Изменения остались в форме." | `ElementSettingsControls.jsx:1294` | `extensionStateSyncState === "error"` |
| "Не удалось сохранить Properties." | `NotesPanel.jsx:2551` / `camundaExtensionsSaveBoundary.js:193` | Любой не-409 или retry-fail |
| "Не удалось очистить Properties." | `NotesPanel.jsx` reset flow | Reset property state failed |
| "Сохранено на сервере." | `NotesPanel.jsx:2533` | `onDurableSaveAck` |
| "Сохранено на сервере. Обновляем состояние…" | `NotesPanel.jsx:2537` | background refresh start |
| "Без изменений." | `NotesPanel.jsx:2519` | normalized draft equals persisted state |
| "Пустая BPMN XML: не удалось применить Properties." | `camundaExtensionsSaveBoundary.js:120` | `nextXml` пустой |
| "Изменения Properties не применились к BPMN XML." | `camundaExtensionsSaveBoundary.js:123` | `nextXml === currentXml` |
| "apiPutBpmnXml unavailable" | `camundaExtensionsSaveBoundary.js:149` | api client не передан |

## Backend коды ошибок

| Код | HTTP | Где | Когда |
|---|---|---|---|
| `DIAGRAM_STATE_CONFLICT` | 409 | `_require_diagram_cas_or_409` | `client_base_version != server_current_version` |
| `DIAGRAM_STATE_BASE_VERSION_REQUIRED` | 409 | `_require_diagram_cas_or_409` | `client_base_version is None` |
| `Session is being updated, retry` | 423 | `session_bpmn_save` | Redis lock не получен |
| `forbidden` | 403 | `_can_edit_workspace` | Нет прав на workspace |
| `xml is empty` | 400 | `session_bpmn_save` | `xml` пустая строка |
| `not found` | 404 | `_legacy_load_session_scoped` | Сессия не найдена или нет доступа |

## Backend логи (где искать)

- `backend/logs/` — приложение пишет traceback при 500.
- `backend/app/redis_lock.py`:
  - `redis_lock: failed to release lock ...`
  - `redis_lock: lock not owned ...`
- `backend/app/_legacy_main.py`:
  - `subprocess_parent_sync_failed: ...` — предупреждение, не ошибка.
- `backend/app/cache/session_cache.py`:
  - `session_cache: bpmn_meta normalization failed for ...`

## Frontend console логи

- `[PATCH_SESSION] start sid=... payloadKeys=...`
- `[PATCH_SESSION] done sid=... status=...`
- `PERSIST_OK sid=... rev=...`
- `update_properties_unavailable`
- `extension_property_update_failed`
- `rename_failed`
- `set_documentation_failed`

## Что нужно собрать для root cause

1. Network tab: запрос `PUT /api/sessions/{sid}/bpmn` с `reason=manual_save:camunda_extensions`.
2. Response status и body (особенно `code`, `server_current_version`, `client_base_version`).
3. Frontend console: наличие `[PATCH_SESSION]` / `PERSIST_OK` / ошибок.
4. Backend logs за тот же период: traceback, 409/423 частота, Redis lock warnings.
5. Значение `draft.diagram_state_version` в момент нажатия Save (можно через React DevTools или временный console.log).

## Примечание

Ни один runtime log не был предоставлен в рамках данного аудита. Все записи выше получены из статического анализа кода. Для точного определения причины необходимы логи/скриншоты с воспроизведения.
