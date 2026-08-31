# TESTS — feature/session-assignees

## Backend — `backend/tests/test_session_assignees.py`

### 1. Схема
- `test_schema_has_session_assignees_table` — проверить колонки `session_id`, `user_id`, `assigned_by`, `assigned_at`.

### 2. Сервисный слой (`AssignmentService`)
- `test_replace_assignees_adds_multiple_and_lists_them` — замена списка.
- `test_replace_assignees_is_idempotent_replace` — дедупликация и порядок.
- `test_replace_assignees_clears_all` — пустой список удаляет все записи.
- `test_list_assignees_requires_org_member` — доступ только членам орг.

### 3. Права
- `test_project_owner_can_assign` — владелец проекта.
- `test_project_executor_can_assign` — исполнитель проекта.
- `test_org_admin_can_assign` — org_admin.
- `test_platform_admin_without_membership_can_assign` — platform_admin.
- `test_viewer_cannot_assign` — viewer получает 403.
- `test_editor_cannot_assign` — editor получает 403.

### 4. Валидация
- `test_foreign_user_cannot_be_assigned` — пользователь другой орг → 422.
- `test_missing_user_cannot_be_assigned` — несуществующий пользователь → 422.

### 5. Read paths
- `test_explorer_project_page_includes_assignees` — `GET /api/projects/{id}/explorer` отдаёт `assignees` у сессий.

### 6. События
- `test_assignees_changed_event_is_emitted` — `SessionAssigneesChanged` эмитится с `session_id`, `user_ids`, `actor_id`.

## Frontend

### `frontend/src/features/explorer/explorerAssigneeModel.test.mjs`
- `session assignees: read normalized list, ids, labels and overflow` — 3 assignees, overflow +1.
- `session assignees: empty state renders dash and assign action` — пустое состояние.

### `frontend/src/lib/api.sessionAssignees.test.mjs`
- `apiGetSessionAssignees: calls GET /sessions/{id}/assignees and normalizes items`.
- `apiGetSessionAssignees: accepts plain array response`.
- `apiReplaceSessionAssignees: PUTs idempotent user_ids list and returns normalized ids`.
- `apiReplaceSessionAssignees: clears assignees when empty list passed`.
- rejection on missing session id.

### `frontend/src/features/explorer/workspaceSessionAssignees.source.test.mjs`
- `ProjectPane table exposes session assignees column` — колонка, colgroup, пропсы.
- `SessionRow renders assignees cell and menu action without reusing folder/project dialog`.
- `SessionAssigneesDialog is a multi-select picker with checkboxes`.
- `API exposes session assignees helpers`.

## Запуск

```bash
# backend
cd backend
python -m unittest tests.test_session_assignees -v

# frontend (в Docker, node на хосте не установлен)
cd frontend
docker run --rm -v "$PWD:/app" -w /app node:20-alpine node --test src/features/explorer/explorerAssigneeModel.test.mjs src/lib/api.sessionAssignees.test.mjs src/features/explorer/workspaceSessionAssignees.source.test.mjs
```

## Статус

- [x] Backend-тесты проходят.
- [x] Frontend-тесты контура проходят.
- [x] `docs/openapi.yaml` обновлён и проходит lint.
