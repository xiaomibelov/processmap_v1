# API gap analysis — analytics backend-driven multi-scope

## Current endpoint inventory

### Registries (consistent envelope)

| Method | Path | Handler | Notes |
|---|---|---|---|
| POST | `/api/analysis/product-actions/registry/query` | `product_actions_registry.query_product_actions_registry` | Multi-scope |
| POST | `/api/analysis/product-actions/registry/export.csv` | `export_product_actions_registry_csv` | Streams CSV |
| POST | `/api/analysis/product-actions/registry/export.xlsx` | `export_product_actions_registry_xlsx` | Streams XLSX |
| GET | `/api/sessions/{session_id}/analysis/view-model` | `product_actions_registry.get_session_analysis_view_model` | Session-scope detail |
| POST | `/api/analysis/properties/registry/query` | `process_properties_registry.query_process_properties_registry` | Multi-scope |
| POST | `/api/analysis/properties/registry/export.csv` | `export_process_properties_registry_csv` | Streams CSV |
| POST | `/api/analysis/properties/registry/export.xlsx` | `export_process_properties_registry_xlsx` | Streams XLSX |

### Dashboards (legacy-style endpoints)

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/sessions/{session_id}/analytics` | `_legacy_main.get_session_analytics` | Recomputes + caches |
| GET | `/api/projects/{project_id}/analytics` | `project_analytics.get_project_analytics` | Loads ≤500 sessions |
| GET | `/api/workspaces/{workspace_id}/analytics` | `project_analytics.get_workspace_analytics` | Loads ≤500 sessions deduped |

### Org property dictionary (isolated)

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/orgs/{org_id}/property-dictionary/operations[/{key}]` | Operation taxonomy CRUD |
| GET/POST/PATCH/DELETE | `/api/orgs/{org_id}/property-dictionary/operations/{key}/properties[/{prop}]` | Property definition CRUD |
| POST/PATCH/DELETE | `/api/orgs/{org_id}/property-dictionary/operations/{key}/properties/{prop}/values[/{id}]` | Allowed values CRUD |

---

## Gap 1: Dashboards lack a registry-style query envelope

**Current state**
- Dashboard endpoints return flat summaries: `sessions_count`, `total_actions`, `avg_duration_min`, `total_critical_questions`.
- No `rows` collection, no `filter_options`, no `metrics`, no `empty_state`, no `source_state`.

**Missing contract**

```json
{
  "ok": true,
  "scope": "workspace",
  "rows": [ /* per-session or per-project rows */ ],
  "summary": { "sessions_count": 12, "total_actions": 340 },
  "filter_options": { "roles": [...], "sections": [...] },
  "applied_filters": {},
  "metrics": { "total_rows": 500, "filtered_rows": 12, ... },
  "empty_state": { "kind": "...", ... },
  "source_state": { "source": "analytics_backend", "sessions_scanned": 500 }
}
```

**Impact**
- Frontend cannot reuse registry rendering/pagination logic.
- Cannot add filters or exports without changing both backend and frontend.

---

## Gap 2: No unified analytics query endpoint

**Current state**
- Each surface has its own endpoint family.
- There is no `POST /api/analysis/query` that can return any of {product-actions, properties, dashboard} by `report_type`.

**Desired**

```json
POST /api/analysis/query
{
  "report_type": "product_actions|properties|dashboard",
  "scope": "workspace|project|session",
  "workspace_id": "...",
  "project_id": "...",
  "session_id": "...",
  "filters": { ... },
  "limit": 100,
  "offset": 0
}
```

**Impact**
- Adding a new report type requires a new router, new storage method, new frontend API wrapper.
- Cannot build a generic analytics builder/explorer UI.

---

## Gap 3: Property registry does not use the org property dictionary

**Current state**
- `process_properties_registry.py` only reads `bpmn_meta.camunda_extensions_by_element_id`.
- Org dictionary endpoints are separate and not called.

**Missing**
- Endpoint or internal join that returns **expected** properties from the dictionary alongside **actual** properties found in diagrams.
- Completeness should measure "expected and present" vs. "present but not expected".

**Impact**
- The registry is a passive extractor, not a compliance/validation tool.

---

## Gap 4: Dashboards have no export

**Current state**
- Registries export CSV/XLSX.
- Dashboards do not.

**Missing**
- `GET /api/projects/{id}/analytics/export.{csv,xlsx}`
- `GET /api/workspaces/{id}/analytics/export.{csv,xlsx}`
- `GET /api/sessions/{id}/analytics/export.{csv,xlsx}`

---

## Gap 5: Analytics computation is not materialized

**Current state**
- `compute_analytics()` runs on demand.
- `session.analytics_json` is only populated when `_recompute_session()` is triggered.
- Project/workspace aggregations call `storage.load()` for each session.

**Missing**
- Projection worker that recomputes `analytics_json` when nodes/edges/questions change.
- Materialized roll-up tables for project/workspace.

**Impact**
- Request latency grows with workspace size; risk of timeouts.

---

## Gap 6: Authz is inconsistent

**Current state**
- Registries use `require_authenticated_user`, `request_active_org_id`, `require_org_member_for_enterprise`, and `project_access_allowed`.
- `project_analytics.py` imports private `_legacy_main` helpers (`_request_active_org_id`, `_enterprise_require_org_member`, `_project_scope_for_request`) and `scope_allowed_project_ids`.
- `_legacy_main.get_session_analytics` uses `_legacy_load_session_scoped`.

**Missing**
- Shared authz dependency for analytics endpoints.
- Unified 404 behavior (current code mixes `{"error":"not found"}` and HTTPException).

**Impact**
- Higher risk of authz bugs when adding new endpoints.

---

## Gap 7: No async or cache layer

**Current state**
- All aggregation is synchronous.
- Registries scan up to 10,000 sessions per request.
- Dashboards scan up to 500 sessions per request.

**Missing**
- Background job for large workspace roll-ups.
- Redis/cache TTL for snapshot results.
- Streaming/pagination for large exports.

---

## Gap 8: Frontend API wrappers are surface-specific

**Current state**
- `apiQueryProductActionRegistry()` and `apiQueryProcessPropertiesRegistry()` are separate wrappers returning similar shapes.
- Dashboards use separate `apiGetSessionAnalytics`, `apiGetProjectAnalytics`, `apiGetWorkspaceAnalytics` (assumed from dashboard components).

**Missing**
- Generic `apiQueryAnalytics({ reportType, scope, ... })` wrapper.
- Shared TypeScript/JSDoc types for the registry envelope.

---

## Gap 9: Scope switcher is not an API concept

**Current state**
- Scope switching is implemented in `ProductActionsRegistryPanel` buttons and `useAnalyticsRouteState` URL helpers.
- Backend accepts scope but does not expose a "scope metadata" endpoint (e.g. "what scopes am I allowed to see for this entity?").

**Missing**
- `GET /api/analysis/scope-context?workspace_id=...&project_id=...&session_id=...` returning available scopes and entity titles.

---

## Recommended new/modified endpoints

1. `POST /api/analysis/query` — unified analytics query.
2. `POST /api/analysis/dashboards/query` — dashboard view-model with full envelope.
3. `GET/POST /api/analysis/dashboards/export.{csv,xlsx}` — dashboard export.
4. `GET /api/analysis/scope-context` — available scopes and titles.
5. `POST /api/analysis/properties/registry/query` (enhanced) — include org dictionary expected properties.
6. `POST /api/analysis/materialize` (admin/internal) — trigger analytics projection for a scope.

## Files involved in closing gaps

- `backend/app/routers/project_analytics.py`
- `backend/app/routers/process_properties_registry.py`
- `backend/app/routers/product_actions_registry.py`
- `backend/app/analytics.py`
- `backend/app/storage.py`
- `backend/app/services/org_workspace.py`
- `frontend/src/features/analytics/dashboardModel.js`
- `frontend/src/features/analytics/AnalyticsDashboards.jsx`
- `frontend/src/lib/api.js`
- `frontend/src/lib/apiRoutes.js`
