# Project Sessions API

## Modes
- `quick_skeleton` — быстрый скелет
- `deep_audit` — глубокий аудит

## Create session under project
`POST /api/projects/{project_id}/sessions?mode=quick_skeleton|deep_audit`

Body:
```json
{"title":"Интервью #1","roles":["cook_1","technolog"],"start_role":"cook_1"}
```

Ответ: Session v2, включая `project_id` и `mode`.

## List sessions of project
`GET /api/projects/{project_id}/sessions?mode=...&q=...&limit=200`

Ответ: список summary объектов (как `/api/sessions` list), но с `project_id` и `mode`.
