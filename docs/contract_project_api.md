# Project API contract (Epic #1)

Frontend dev: http://localhost:5174

All frontend requests go to `/api/*` with `credentials: "include"` (cookie session).
CORS must allow origin `http://localhost:5174` and `allow-credentials: true`.

## Required endpoints

- `GET /api/meta` -> `200 application/json` and `features.projects=true`
- `GET /api/projects` -> list[Project]
- `POST /api/projects` -> Project
- `GET /api/projects/{project_id}` -> Project
- `PATCH /api/projects/{project_id}` -> Project (partial update)
- `PUT /api/projects/{project_id}` -> Project (replace)

## Project shape

Minimal (MVP):

```json
{
  "id": "a1b2c3d4e5",
  "title": "Кухня №3 / сырники",
  "passport": {
    "site_type": "dark_kitchen",
    "language": "ru",
    "units": {"mass":"g","temp":"C","time":"min"},
    "standards": {"haccp": true, "allergens": true, "traceability": false},
    "process_name": "Сырники",
    "product_family": "Выпечка",
    "kpi": {"speed": true, "quality": true, "loss": false, "safety": true},
    "owner": {"name":"...", "phone":"...", "email":"..."}
  },
  "created_at": 1700000000,
  "updated_at": 1700000100,
  "version": 2
}
```

Notes:

- `passport` is intentionally flexible (`dict`), backend does a shallow merge on PATCH.
- Frontend can send full passport via PUT to replace it.


## Project sessions

### GET /api/projects/{project_id}/sessions

Returns a lightweight list of sessions belonging to the project.

Query params:
- `q` (optional): substring filter by title
- `limit` (optional, default 200)

Response: array of session list items.

Each item includes at least: `id`, `title`, `roles`, `start_role`, `project_id`, `mode`, `updated_at`.

### POST /api/projects/{project_id}/sessions

Creates a new session bound to the project.

Body (same shape as `POST /api/sessions`, plus optional `mode`):
- `title`: string
- `roles`: array of role ids
- `start_role` (optional)
- `mode` (optional): `quick_skeleton` or `deep_audit` (default `quick_skeleton`)

Response: full session object.

## Explorer item aggregates (projects-table-v2)

`GET /api/explorer` возвращает `items` (folder/project) с агрегатными полями счётчиков сессий.
Семантика полей прогресса (аддитивно, старые поля не меняются):

| Поле | Кем возвращается | Семантика |
| --- | --- | --- |
| `sessions_count` (SQL) / `descendant_sessions_count` | project / folder и project | Сырый COUNT всех сессий проекта (включая архивные и мягко удалённые). Для folder — сумма по поддереву. Legacy, НЕ использовать для прогресс-бара. |
| `trackable_sessions_count` | project | Число «активных» сессий проекта: исключены сессии со статусом `archived` (manual `interview.status`) и мягко удалённые (`deleted_at > 0`). Знаменатель прогресса. |
| `descendant_trackable_sessions_count` | folder | Сумма `trackable_sessions_count` по поддереву раздела. |
| `done_sessions_count` | project | Число сессий проекта со статусом `ready` (manual `interview.status="ready"` либо derived по `report_versions`). Числитель прогресса. |
| `descendant_done_sessions_count` | folder | Сумма `done_sessions_count` по поддереву раздела. |

Инварианты:
- `done_sessions_count <= trackable_sessions_count <= sessions_count`.
- Статус сессии вычисляется `app/session_status.py::derive_session_status` (зеркало `_workspace_session_status`): manual `interview.status` в приоритете, иначе derived (`ready` если есть `report_versions`; `in_progress` если `version>0`/`bpmn_xml_version>0`/непустой interview; иначе `draft`).
- Прогресс-пара на фронте: `done / trackable` (fallback на legacy-поля для старых ответов API).
