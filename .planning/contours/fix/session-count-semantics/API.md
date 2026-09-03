# fix/session-count-semantics — API-семантика счетчиков

## Термины

- `root session` — строка `sessions`, у которой `parent_session_id` пустой или `NULL`.
- `subprocess session row` — материализованный внутренний подпроцесс, у которого `parent_session_id` непустой.
- `session counter` во внешнем UI всегда считает только `root session`.

## Workspace Explorer

Endpoint:

`GET /api/explorer?workspace_id={workspace_id}&folder_id={folder_id}`

Поля проекта:

- `sessions_count` — количество root sessions проекта. Subprocess rows не входят.
- `descendant_sessions_count` — для project совпадает с `sessions_count`; для folder суммирует root sessions во всех descendant projects/folders.
- `trackable_sessions_count` — количество root sessions проекта, исключая soft-deleted и archived.
- `done_sessions_count` — количество root sessions проекта в статусе `ready`.
- `descendant_trackable_sessions_count` — folder rollup `trackable_sessions_count`.
- `descendant_done_sessions_count` — folder rollup `done_sessions_count`.

Progress bar:

- denominator = `trackable_sessions_count` / `descendant_trackable_sessions_count`;
- numerator = `done_sessions_count` / `descendant_done_sessions_count`;
- subprocess rows не участвуют ни в numerator, ни в denominator.

## Project Explorer

Endpoint:

`GET /api/projects/{project_id}/explorer?workspace_id={workspace_id}&root_only=true&include_children_meta=true`

Список `sessions` для project tree содержит root sessions. Child subprocess sessions доступны через subprocess/children endpoints и не являются внешними session counters.

## Legacy Workspace Dashboard

Endpoint:

`GET /api/enterprise/workspace`

Поля `summary.total`, `projects[].session_count`, `users[].session_count` считаются только по root sessions. Subprocess rows с `parent_session_id` игнорируются.

## UI contract

Проект с 3 root sessions, из которых 1 в статусе `ready`, и 148 materialized subprocess rows отображается как `1/3 сессии`, а не `3/148`.

