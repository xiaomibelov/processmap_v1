# API — session assignees

## Статус

- В source worktree endpoint объявлен в `backend/app/routers/sessions.py`.
- Stage reproduction round 2: `PUT /api/sessions/ddc8a44ade/assignees` с одним assignable user возвращал `500 {"detail":"internal_server_error","request_id":"req_fe96e556e303"}`; `PUT` с пустым массивом возвращал `200`, `GET` возвращал `200 []`. Это сужает дефект до insert path.
- Исправление round 2: insert в `session_assignees` строится по фактическим колонкам таблицы и заполняет совместимые stage/drift поля `id`, `org_id`, `project_id`, `created_at`, `updated_at`, `assigned_by`, `assigned_at`, если они есть. Это не меняет публичный API.
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

## Explorer composition fields

Семантика полей API для колонки `Состав`:

- `sessions_count` — общее количество сессий проекта.
- `descendant_sessions_count` — количество сессий внутри раздела/папки рекурсивно.
- `trackable_sessions_count` — количество активных, не архивных и не soft-deleted сессий проекта.
- `descendant_trackable_sessions_count` — active/trackable сумма по разделу/папке.
- `done_sessions_count` — количество trackable сессий проекта со статусом `ready`.
- `descendant_done_sessions_count` — сумма `done_sessions_count` по разделу/папке.

UI больше не показывает голое `D/T`: прогресс подписан как `D/T сессий`, tooltip — `Готово D из T активных сессий (P%)`.
