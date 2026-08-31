# API — feature/session-assignees

## Endpoints

### `GET /api/sessions/{session_id}/assignees`

Возвращает текущих ответственных исполнителей сессии.

**Права:** любой участник орг с доступом к проекту. Проверка через `session_access_from_request`.

**Response 200 (array):**
```json
[
  {
    "user_id": "u1",
    "display_name": "Иван Иванов",
    "full_name": "Иван Иванов",
    "email": "ivan@local",
    "job_title": "Технолог"
  }
]
```

**Errors:**
- 404 — сессия не найдена или нет доступа.
- 401/403 — стандартные auth.

---

### `PUT /api/sessions/{session_id}/assignees`

Идемпотентная замена полного списка исполнителей.

**Права:** `is_admin` OR `org_admin` OR `project.owner_user_id == actor` OR `project.executor_user_id == actor`.

**Request body:**
```json
{
  "user_ids": ["u1", "u2"]
}
```

- `user_ids` — массив уникальных строк. Порядок сохраняется.
- Пустой массив — снятие всех исполнителей.

**Response 200:**
```json
{
  "user_ids": ["u1", "u2"]
}
```

**Errors:**
- 404 — сессия не найдена.
- 403 — недостаточно прав.
- 422 — один из `user_ids` не существует или не является членом орг (platform_admin без членства допускается, как в folder/project).

---

## Pydantic-схемы

```python
class SessionAssigneeOut(BaseModel):
    user_id: str
    email: str = ""
    full_name: str = ""
    job_title: str = ""
    display_name: str = ""


class SessionAssigneesReplaceIn(BaseModel):
    user_ids: List[str] = Field(default_factory=list)
```

## Права (матрица)

| Роль / статус                              | GET | PUT |
|--------------------------------------------|-----|-----|
| platform_admin                             | ✓   | ✓   |
| org_admin / org_owner                      | ✓   | ✓   |
| project_manager / editor / viewer          | ✓   | ✗   |
| Владелец проекта (`project.owner_user_id`) | ✓   | ✓   |
| Исполнитель проекта (`project.executor_user_id`) | ✓   | ✓   |

Проверка выполняется в `AssignmentService` после загрузки сессии и проекта.

## Валидация пользователей

Переиспользуем `app.services.org_workspace.validate_org_user_assignable(org_id, user_id)`:
- пользователь не найден — 422.
- пользователь не из орг и не platform_admin — 422.

## События и кэши

- После успешного `PUT` эмитится `SessionAssigneesChanged(session_id, user_ids, actor_id)` через `session_event_bus.publish_nowait`.
- Инвалидация:
  - `explorer_invalidate_sessions(project_id)` — список сессий проекта.
  - `session_cache.invalidate_session(session_id)` — projection сессии.

## Интеграция со списками сессий

Для отображения в UI в read-path добавляем поле `assignees` к dict сессии:

```json
{
  "id": "abc123",
  "name": "Схема 1",
  "status": "draft",
  "assignees": [
    {"user_id": "u1", "display_name": "Иван Иванов"},
    {"user_id": "u2", "display_name": "Пётр Петров"}
  ],
  ...
}
```

Поле заполняется в `canvas_session/repository.py` для `list_project_sessions_for_explorer`, `list_session_children` и связанных read paths.

## Ошибки (договорённости)

- 422 отвечает стандартным FastAPI `detail`.
- 403 отвечает `{"detail": "forbidden"}`.
- 404 отвечает `{"detail": "not_found"}`.
