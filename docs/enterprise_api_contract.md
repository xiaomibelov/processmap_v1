# Enterprise API Contract (MVP Blueprint)

Ниже контракт для enterprise-контура. Это целевая спецификация поверх текущего API.

## 1) Org / Membership / Invites

### Orgs
- `GET /api/orgs`
  - Policy: authenticated user
  - 200: список org, где есть membership
- `POST /api/orgs`
  - Policy: system-admin или self-serve enable
  - 201: созданный org
  - 403: policy deny

- `GET /api/orgs/{org_id}`
  - Policy: org member
  - 404: not found in scope
- `PATCH /api/orgs/{org_id}`
  - Policy: OrgOwner/OrgAdmin
  - 403/404

### Members
- `GET /api/orgs/{org_id}/members`
  - Policy: OrgOwner/OrgAdmin/Auditor(read)
- `POST /api/orgs/{org_id}/members`
  - Policy: OrgOwner/OrgAdmin
  - payload: `{ user_id, role, project_scope? }`
- `PATCH /api/orgs/{org_id}/members/{member_id}`
  - Policy: OrgOwner/OrgAdmin
  - payload: `{ role?, status?, project_scope? }`
- `DELETE /api/orgs/{org_id}/members/{member_id}`
  - Policy: OrgOwner/OrgAdmin

### Invites
- `GET /api/orgs/{org_id}/invites`
  - Policy: OrgOwner/OrgAdmin
- `POST /api/orgs/{org_id}/invites`
  - Policy: OrgOwner/OrgAdmin
  - payload: `{ email, role, project_scope?, expires_at? }`
- `POST /api/invites/{invite_id}/accept`
  - Policy: authenticated target user
- `POST /api/invites/{invite_id}/revoke`
  - Policy: OrgOwner/OrgAdmin

## 2) Projects / Sessions (tenant-scoped)

### Projects
- `GET /api/orgs/{org_id}/projects`
  - Policy: org member + project scope
- `POST /api/orgs/{org_id}/projects`
  - Policy: OrgOwner/OrgAdmin/ProjectManager
  - payload: `{ title, passport, workspace_id? }`
- `GET /api/orgs/{org_id}/projects/{project_id}`
  - Policy: scoped member
- `PATCH /api/orgs/{org_id}/projects/{project_id}`
  - Policy: OrgOwner/OrgAdmin/ProjectManager(scoped)
- `DELETE /api/orgs/{org_id}/projects/{project_id}`
  - Policy: OrgOwner/OrgAdmin/ProjectManager(scoped)

### Sessions
- `GET /api/orgs/{org_id}/projects/{project_id}/sessions`
  - Policy: scoped member
- `POST /api/orgs/{org_id}/projects/{project_id}/sessions`
  - Policy: OrgOwner/OrgAdmin/ProjectManager/Editor
- `GET /api/orgs/{org_id}/sessions/{session_id}`
  - Policy: scoped member
- `PATCH /api/orgs/{org_id}/sessions/{session_id}`
  - Policy: OrgOwner/OrgAdmin/ProjectManager/Editor
- `DELETE /api/orgs/{org_id}/sessions/{session_id}`
  - Policy: OrgOwner/OrgAdmin/ProjectManager

## 3) Reports / Artifacts

### Reports
- `POST /api/orgs/{org_id}/sessions/{session_id}/paths/{path_id}/reports`
  - Policy: Editor+
- `GET /api/orgs/{org_id}/sessions/{session_id}/paths/{path_id}/reports`
  - Policy: Viewer+
- `GET /api/orgs/{org_id}/reports/{report_id}`
  - Policy: Viewer+ scoped
- `DELETE /api/orgs/{org_id}/reports/{report_id}`
  - Policy: ProjectManager+

### Artifacts / Export
- `GET /api/orgs/{org_id}/sessions/{session_id}/export`
  - Policy: Viewer+ scoped
- `GET /api/orgs/{org_id}/sessions/{session_id}/export.zip`
  - Policy: Viewer+ scoped

## 4) Audit

- `GET /api/orgs/{org_id}/audit`
  - Policy: OrgOwner/OrgAdmin/Auditor
  - query: `entity_type`, `entity_id`, `actor_user_id`, `action`, `date_from`, `date_to`, `page`, `limit`
- `GET /api/orgs/{org_id}/audit/{event_id}`
  - Policy: OrgOwner/OrgAdmin/Auditor

## 5) Error contract (единый)

- `401 unauthorized` — токен/сессия невалидны.
- `403 forbidden` — роль не позволяет действие.
- `404 not_found` — сущность отсутствует в текущем tenant scope.
- `409 conflict` — версия/конкурентное изменение.
- `422 validation_error` — невалидный payload.

Формат ошибки:
```json
{
  "error": {
    "code": "forbidden",
    "message": "insufficient_permissions",
    "details": {}
  },
  "request_id": "..."
}
```

## 6) Совместимость с текущим API

- На rollout этапе допускается dual-routing:
  - legacy `/api/projects`, `/api/sessions` (старый UI)
  - new `/api/orgs/{org_id}/...` (enterprise UI)
- Legacy endpoints должны внутри резолвить `default_org_id`, чтобы не терять обратную совместимость.

## Риски и неизвестные

1. Не зафиксирован окончательный способ передачи active org context (path vs header+claim).
2. Не определено, будет ли `workspace_id` обязательным сразу или позже.
3. Не согласован контракт soft-delete для reports/projects/sessions.
4. Не определены SLA/ratelimits на report generation и export в tenant-контуре.
