---
atlas_note: "06_Backend API карта"
contour: "fix/project-sessions-list-summary-payload-v1"
status: "implemented-source-tested"
date: "2026-04-30"
source: "fallback"
---

# 06_Backend API карта

> [!warning]
> Obsidian update подготовлен в fallback path, потому что Atlas notes недоступны через MCP.

## Лёгкий contract списка сессий проекта

| Endpoint | Назначение | Поля | Что не входит | Используется где |
| -------- | ---------- | ---- | ------------- | ---------------- |
| `GET /api/projects/{project_id}/sessions?view=summary` | Лёгкий список сессий проекта для bootstrap/list UI | `id`, `session_id`, `title`, `name`, `roles`, `start_role`, `project_id`, `mode`, `bpmn_xml_version`, `diagram_state_version`, `bpmn_graph_fingerprint`, `version`, `owner_user_id`, `org_id`, `created_by`, `updated_by`, `created_at`, `updated_at`, `has_bpmn_xml`, `status`, `stage` | `bpmn_xml`, полный `interview`, `bpmn_meta`, `notes`, `notes_by_element`, `analytics`, `resources`, `normalized`, report/doc/version payloads | `frontend/src/lib/api.js::apiListProjectSessions` |
| `GET /api/projects/{project_id}/sessions` | Старый full contract | Полный `_session_api_dump` | Ничего не исключено | Backward compatibility |
| `GET /api/projects/{project_id}/sessions?view=full` | Явный full contract | Полный `_session_api_dump` | Ничего не исключено | Диагностика/unknown callers |
| `GET /api/orgs/{org_id}/projects/{project_id}/sessions?view=summary` | Enterprise/org-scoped summary mode | Те же summary поля | Те же heavy fields | Additive enterprise path |

> [!summary]
> Summary строится через `Storage.list_project_session_summaries()` и узкий SQL `SELECT`, без `SELECT *` и без загрузки тяжелых JSON/XML полей в Python.

Файлы:

| Файл | Изменение |
| ---- | --------- |
| `backend/app/storage.py` | Добавлен `list_project_session_summaries()` |
| `backend/app/_legacy_main.py` | Добавлен `view=summary/full` для project/org project sessions routes |
| `frontend/src/lib/apiRoutes.js` | Добавлен query param `view` |
| `frontend/src/lib/api.js` | `apiListProjectSessions()` по умолчанию использует `summary` |

Связанные заметки: [[08_Карта производительности]], [[16_Журнал решений]].
