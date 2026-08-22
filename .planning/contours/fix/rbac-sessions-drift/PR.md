# PR: fix(rbac): выровнять authz sessions.py vs sessions_new.py

**Ветка:** `fix/rbac-sessions-drift`  
**База:** `main`  
**Контур:** `.planning/contours/fix/rbac-sessions-drift/`

## Что изменено

Устранены 2 inconsistency между `sessions.py` и `sessions_new.py`:

1. **`DELETE /api/sessions/{id}`**
   - `sessions.py`: раньше использовал `_svc.delete_session` (owner/platform-admin only).
   - `sessions_new.py`: раньше вызывал `_svc.delete_session_api(session_id)` без `request` (bypass / broken).
   - **Единый стандарт:** `_can_delete_workspace_content` (org admin/owner + platform admin).

2. **`PUT /api/sessions/{id}/bpmn`**
   - `sessions.py`: уже передавал `request` в `_svc.bpmn_save`, который проксирует в `_legacy_main.session_bpmn_save` с проверкой `_can_edit_workspace`.
   - `sessions_new.py`: раньше вызывал `_svc.session_bpmn_save(session_id, inp)` без `request`, обходя authz.
   - **Единый стандарт:** `_can_edit_workspace` в обоих роутерах; `request` передаётся в сервис.

## Почему выбран этот стандарт

- `_can_delete_workspace_content` строже, чем owner-only: он ограничивает удаление org admin/owner + platform admin. Это соответствует модели workspace-прав доступа, где org admin управляет контентом организации.
- `_can_edit_workspace` (editor+) для BPMN save уже использовался в `sessions.py` и является существующим стандартом для write-операций над диаграммой.

## Изменённые файлы

- `backend/app/routers/sessions.py` — `DELETE /api/sessions/{id}` теперь использует `_svc.delete_session_api(session_id, request)`.
- `backend/app/routers/sessions_new.py`:
  - Добавлены минимальные импорты (`Optional`, `Query`, схемы) и исправлен синтаксис `bpmn/versions`.
  - `DELETE /api/sessions/{id}` передаёт `request`.
  - `PUT /api/sessions/{id}/bpmn` вызывает `_svc.session_bpmn_save(session_id, inp, request)`.
- `backend/app/services/session_service.py`:
  - Добавлен `delete_session_api(session_id, request)` — thin wrapper над `_legacy_main.delete_session_api`.
  - Добавлен `session_bpmn_save(session_id, inp, request)` — router-facing alias для `bpmn_save`.
- `backend/tests/test_sessions_drift.py` — новый тестовый файл.

## Тесты

- `test_delete_session_viewer_denied_in_both_routers` — viewer получает 403 при DELETE в `sessions.py` и `sessions_new.py`.
- `test_put_bpmn_editor_allowed_viewer_denied_in_both_routers` — editor получает 200, viewer получает 403 при PUT bpmn в обоих роутерах.

## Проверка

```bash
cd backend
PYTHONPATH=. .venv/bin/pytest tests/test_sessions_drift.py -v
PYTHONPATH=. .venv/bin/pytest tests/test_bpmn_save_rbac_scope.py tests/test_session_read_rbac.py tests/test_notes_extraction_preview_endpoint.py tests/test_workspace_access_controls.py -v
```

Результат: 41 passed (2 новых + 39 регрессионных), 1 pre-existing failure в `test_editor_can_export_bpmn_for_project_session`, не связан с этим PR.

## Риски

- **Изменение сигнатуры `session_service`:** добавлены два thin wrapper'а (`delete_session_api`, `session_bpmn_save`), не изменяющие поведение существующих методов.
- **sessions_new.py** всё ещё не подключён к `ROUTERS`, поэтому runtime-роутинг не изменился.
- `DELETE /api/sessions/{id}` в `sessions.py` теперь позволяет org admin/owner удалять чужие сессии — это и есть цель выравнивания.

## Merge / Deploy

**No merge/deploy без explicit approve.**
