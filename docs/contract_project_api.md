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
