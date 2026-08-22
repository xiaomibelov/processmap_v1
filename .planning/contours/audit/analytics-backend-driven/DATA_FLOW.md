# Analytics data flow

## 1. Product Actions Registry

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Frontend: ProductActionsRegistryPanel.jsx                                   │
│  • Derives scope from props (workspace/project/session).                     │
│  • Calls apiQueryProductActionRegistry(payload)                              │
│    → POST /api/analysis/product-actions/registry/query                       │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│  Backend: backend/app/routers/product_actions_registry.py                    │
│  • _normalize_scope() validates workspace|project|session.                   │
│  • Validates workspace/project/session IDs against authz.                    │
│  • Calls storage.list_product_action_registry_sources(...)                   │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│  Storage: backend/app/storage.py                                             │
│  SELECT s.id, s.title, s.project_id, s.org_id, s.interview_json,             │
│        s.diagram_state_version, s.updated_at, p.title, p.workspace_id,       │
│        p.folder_id, wf.name                                                  │
│  FROM sessions s                                                             │
│  LEFT JOIN projects p ON p.id = s.project_id AND p.org_id = s.org_id         │
│  LEFT JOIN workspace_folders wf ...                                          │
│  WHERE s.org_id = ? [AND workspace/project/session filters]                  │
│  ORDER BY s.updated_at DESC LIMIT 10000                                      │
│                                                                              │
│  → For each row, parse interview_json → analysis.product_actions[]           │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│  Backend router (continued)                                                  │
│  • _registry_row(source, action) builds each row with business fields.       │
│  • _matches_filters() applies client-provided filters.                       │
│  • _summary(), _metrics(), _filter_options(), _empty_state(),                │
│    _source_state() build the response envelope.                              │
│  • Paginates (limit/offset).                                                 │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│  Frontend                                                                    │
│  • normalizeBackendRows() normalizes row IDs/completeness.                   │
│  • filterProductActionRegistryRows() applies UI filters.                     │
│  • Renders table, session summary, bulk-AI controls, export buttons.         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Session scope special case

For `scope === "session"` the panel calls:

```
GET /api/sessions/{session_id}/analysis/view-model
```

which loads one full session, extracts `interview.analysis.product_actions[]`, and returns a smaller envelope (`analysis.product_actions.{rows,summary,filter_options,metrics,empty_state,source_state}` + `interview_state`).

### Exports

`POST /api/analysis/product-actions/registry/export.{csv,xlsx}` reuses `_registry_payload()` and streams the full filtered result set.

---

## 2. Process Properties Registry

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Frontend: PropertiesRegistry.jsx                                            │
│  • Derives scope from session/project/workspace props.                       │
│  • Calls apiQueryProcessPropertiesRegistry(payload)                          │
│    → POST /api/analysis/properties/registry/query                            │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│  Backend: backend/app/routers/process_properties_registry.py                 │
│  • Same scope/authz validation as product actions.                           │
│  • Calls storage.list_process_properties_registry_sources(...)               │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│  Storage: backend/app/storage.py                                             │
│  SELECT s.id, s.title, s.project_id, s.org_id, s.bpmn_meta_json,             │
│        s.bpmn_xml, s.diagram_state_version, s.updated_at, p.title,           │
│        p.workspace_id, p.folder_id, wf.name                                  │
│  FROM sessions s                                                             │
│  LEFT JOIN projects p ...                                                    │
│  LEFT JOIN workspace_folders wf ...                                          │
│  WHERE s.org_id = ? [AND filters]                                            │
│  ORDER BY s.updated_at DESC LIMIT 10000                                      │
│                                                                              │
│  → For each row, parse bpmn_meta_json → camunda_extensions_by_element_id     │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│  Backend router (continued)                                                  │
│  • _extract_camunda_rows(source)                                             │
│    – Builds element id → {type, title} lookup from BPMN XML.                 │
│    – Iterates extensionProperties and extensionListeners.                    │
│    – Marks completeness based on whether value is empty.                     │
│  • Filters, sorts, paginates, builds summary/metrics/source_state.           │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│  Frontend                                                                    │
│  • Client-side search by property_name.                                      │
│  • Client-side type/source filters.                                          │
│  • Renders table with expandable detail.                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Missing data source

The org property dictionary (`/api/orgs/{org_id}/property-dictionary/...`) is **not** consulted, so the registry cannot enumerate expected properties or validate against dictionary options.

---

## 3. Dashboards

### Session dashboard

```
Frontend SessionAnalyticsDashboard
  → GET /api/sessions/{id}/analytics
       Backend _legacy_main.get_session_analytics()
         → storage.load(session_id)
         → if not session.analytics: _recompute_session() → compute_analytics()
         → save session with analytics_json
         → return {session_id, analytics}
  → dashboardModel.sessionAnalyticsToCards() renders 4 cards.
```

### Project dashboard

```
Frontend ProjectAnalyticsDashboard
  → GET /api/projects/{id}/analytics
       Backend project_analytics.py
         → _legacy_main authz helpers
         → _sessions_for_project(): SELECT id FROM sessions WHERE project_id = ? LIMIT 500
         → storage.load(id) for each session
         → _aggregate_sessions(): compute or read analytics, sum/avg metrics
         → return {project_id, sessions_count, total_actions, avg_duration_min,
                   total_critical_questions, sessions: [...]}
  → dashboardModel.normalizeProjectAnalyticsCards() renders 4 cards.
```

### Workspace dashboard

```
Frontend WorkspaceAnalyticsDashboard
  → GET /api/workspaces/{id}/analytics
       Backend project_analytics.py
         → SELECT projects for workspace
         → For each project: _sessions_for_project(limit=500)
         → Deduplicate by session id, cap at 500
         → _aggregate_sessions()
         → return {workspace_id, projects_count, sessions_count, total_actions,
                   avg_duration_min, recent_sessions: [...20]}
  → dashboardModel.normalizeWorkspaceAnalyticsCards() renders 4 cards.
```

### Dashboard data flow problems

- Every request potentially recomputes analytics for many sessions.
- No filter model is passed to the backend; dashboards are read-only summaries.
- No export path.
- `recent_sessions` is rebuilt with an O(n²) lookup in `get_workspace_analytics`.

---

## 4. Org Property Dictionary (isolated)

```
Admin UI
  → GET    /api/orgs/{org_id}/property-dictionary/operations
  → POST   /api/orgs/{org_id}/property-dictionary/operations
  → GET    /api/orgs/{org_id}/property-dictionary/operations/{key}
  → POST   /api/orgs/{org_id}/property-dictionary/operations/{key}/properties
  → PATCH  /api/orgs/{org_id}/property-dictionary/operations/{key}/properties/{prop}
  → DELETE ...
  → POST/PATCH/DELETE values

Storage
  → org_property_dictionary_operations
  → org_property_dictionary_defs
  → org_property_dictionary_values
```

No consumer currently reads this dictionary inside analytics surfaces.

---

## Request/response envelope comparison

| Surface | Endpoint | `rows` | `sessions` | `filter_options` | `metrics` | `empty_state` | `source_state` | Export |
|---|---|---|---|---|---|---|---|---|
| Product actions registry | POST /api/analysis/product-actions/registry/query | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | csv/xlsx |
| Process properties registry | POST /api/analysis/properties/registry/query | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | csv/xlsx |
| Session analytics | GET /api/sessions/{id}/analytics | ❌ (nested `analytics`) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Project analytics | GET /api/projects/{id}/analytics | ❌ (`sessions`) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Workspace analytics | GET /api/workspaces/{id}/analytics | ❌ (`recent_sessions`) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

The registries share a consistent backend-driven envelope; dashboards do not.
