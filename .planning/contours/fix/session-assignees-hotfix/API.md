# API — session assignees

## Статус

- В source worktree endpoint объявлен в `backend/app/routers/sessions.py`.
- Локальный running container `processmap_v1-api-1` отвечает `404` на `GET/PUT /api/sessions/{id}/assignees`, значит текущий running API не соответствует source checkout этого контура. Логи контейнера не содержат свежих `assignees` 500; локально воспроизведён drift endpoint-а, а не source-level 500.
- Source-контракт закреплён HTTP-тестом `backend/tests/test_session_assignees_api.py`.

## GET /api/sessions/{session_id}/assignees

Возвращает текущих исполнителей сессии.

Успешный ответ:

```json
[
  {
    "user_id": "u_1",
    "email": "anna@example.test",
    "full_name": "Анна Иванова",
    "display_name": "Анна Иванова",
    "job_title": "Аналитик",
    "role": "editor"
  }
]
```

Frontend также принимает legacy wrapper `{ "items": [...], "count": N }`.

При ошибке GET frontend не бросает исключение в render path: возвращает `items: []`, пишет `console.warn("[api] failed to load session assignees", ...)`.

## PUT /api/sessions/{session_id}/assignees

Idempotent replace всех исполнителей сессии.

Request:

```json
{ "user_ids": ["u_1", "u_2"] }
```

Response:

```json
{
  "session_id": "sess_1",
  "user_ids": ["u_1", "u_2"],
  "assigned_by": "u_admin"
}
```

Пустой массив очищает назначения:

```json
{ "user_ids": [] }
```

## Модель совместимости

- Основной frontend/backend контракт: `session.assignees` всегда массив.
- Frontend нормализует legacy single поля на чтении: `assignee_user`, `assignee`, `assigneeUser`, `assignee_user_id`, `assignee_id`, `assigneeUserId`.
- Legacy single значение отображается как массив из одного исполнителя; новые сохранения всегда идут через `PUT .../assignees` с `user_ids: string[]`.
