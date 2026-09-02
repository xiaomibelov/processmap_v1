# fix/projects-table-ux-polish — API-контракт

## Вывод

Для назначения ответственного на сессиях **новых endpoint'ов не требуется**. Контракт уже существует в `main`:

1. `GET/PUT /api/sessions/{session_id}/assignees` — получение/замена исполнителей схемы.
2. `GET /api/projects/{project_id}/explorer` уже возвращает `assignees: List[User]` в каждом элементе `SessionItem`.

## Используемые endpoint'ы

### 1. Загрузка сессий проекта (с assignees)

```
GET /api/projects/{project_id}/explorer?workspace_id={wid}&root_only=true&include_children_meta=true
```

**Ответ (фрагмент):**
```json
{
  "project": { ... },
  "sessions": [
    {
      "id": "53006f5546",
      "name": "123",
      "project_id": "b1c8a56b6e",
      "status": "draft",
      "assignees": []
    }
  ]
}
```

Поле `assignees` заполняется бэкендом в `backend/app/domains/storage/canvas_session/repository.py::list_project_sessions_for_explorer` через `_load_session_assignees`. Если у сессии нет назначенных, возвращается пустой массив.

### 2. Замена исполнителей схемы

```
PUT /api/sessions/{session_id}/assignees
Content-Type: application/json

{ "user_ids": ["<user_id>"] }
```

**Ответ:**
```json
{
  "session_id": "53006f5546",
  "user_ids": ["<user_id>"],
  "assigned_by": "<actor_id>"
}
```

## Изменения в коде

- Фронтенд: добавлен `SessionAssigneeCell` и обработчик `kind: "session_assignees"` в диалог назначения.
- Бэкенд: изменений не требуется. Контракт уже поддерживает `assignees` для сессий.

## Примечание

В локальном dev-стеке, использованном для скриншотов, бэкенд запущен из смежного worktree `fix-stage-session-save-session-not-found-v1`, поэтому `PUT /api/sessions/{id}/assignees` в этой среде отвечает 404. В целевом `origin/main` endpoint присутствует (`backend/app/routers/sessions.py:298-307`) и использует `session_assignment_service.replace_assignees` + `replace_session_assignees` из `canvas_session.repository`.
