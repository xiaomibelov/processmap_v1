# D4 Frontend API Audit (canonicalization)

Date: 2026-03-05  
Scope: `frontend/src/lib/api.js`, `frontend/src/lib/apiRoutes.js`, `frontend/src/lib/apiClient.js`

## Findings (before D4 refactor)

- `api.js` mixed direct string URLs and alias/fallback fanout, mainly in reports (`path/paths`, slash variants).
- No single frontend route map existed; routes were duplicated per wrapper.
- Fallback behavior was spread across operation wrappers instead of one client utility.

## Canonical routes policy (D4)

- One operation -> one canonical URL in `apiRoutes`.
- Alias fallback allowed only for backend-compat endpoints and only via `apiFetchWithFallback`.
- Fallback retried only on `404/405`, and usage is logged (`[API_FALLBACK_USED]`).

## Operation map

| Operation | Current candidates | Who calls it | Proposed canonical route |
|---|---|---|---|
| Get session | `/api/sessions/{id}` | `App.jsx`, stage/interview flows via `apiGetSession` | `/api/sessions/{id}` |
| Put BPMN | `/api/sessions/{id}/bpmn` | Process stage persist (`apiPutBpmnXml`) | `/api/sessions/{id}/bpmn` |
| Patch BPMN meta | `/api/sessions/{id}/bpmn_meta` | Hybrid/templates/meta updates (`apiPatchBpmnMeta`) | `/api/sessions/{id}/bpmn_meta` |
| List projects | `/api/projects` | Workspace/project UI (`apiListProjects`) | `/api/projects` |
| Project sessions | `/api/projects/{id}/sessions?mode=` | Project/session setup (`apiListProjectSessions`) | `/api/projects/{id}/sessions?mode=` |
| Templates list | `/api/templates?scope=...` | `features/templates/api/index.js` | `/api/templates?scope=personal` / `scope=org&org_id=...` |
| Report list for path | canonical + legacy alias | `InterviewPathsView.jsx` | `/api/sessions/{sid}/paths/{pid}/reports` |
| Report item by path | canonical + legacy alias | `InterviewPathsView.jsx` | `/api/sessions/{sid}/paths/{pid}/reports/{rid}` |
| Report item generic | `/api/reports/{rid}` | `InterviewPathsView.jsx` fallback | `/api/reports/{rid}` |
| Enterprise workspace | `/api/enterprise/workspace?...` | Workspace dashboard (`apiGetEnterpriseWorkspace`) | `/api/enterprise/workspace?...` |

## Temporary fallback exceptions kept in D4

1. Path reports alias:
   - primary: `/api/sessions/{sid}/paths/{pid}/reports[...]`
   - fallback: `/api/sessions/{sid}/path/{pid}/reports[...]`
2. Path report item alias:
   - primary: `/api/sessions/{sid}/paths/{pid}/reports/{rid}`
   - fallback: `/api/sessions/{sid}/path/{pid}/reports/{rid}`

Fallback is centralized in `pathReportsFallbackFetch -> apiFetchWithFallback`.

## Evidence commands

```bash
rg -n "apiFetchWithFallback|pathReportsLegacy|pathReportLegacy|fallback" frontend/src/lib/api.js frontend/src/lib/apiClient.js
rg -n "api(CreatePathReportVersion|ListPathReportVersions|GetReportVersion|DeleteReportVersion)" frontend/src
rg -n "\"/api/|`/api/" frontend/src/lib/api.js
```

Expected after D4:

- No literal `"/api/...` strings in `api.js`.
- No endpoint fanout arrays in `api.js`.
- Fallback sites localized to `apiFetchWithFallback` usage in reports compat helper.
