# Analytics backend-driven multi-scope audit

## Source truth

- Repo: `/root/processmap_v1`
- Branch: `audit/analytics-backend-driven`
- HEAD: `9691f07287a55ebcc64fcfd9a54b29a15a72ae4e`
- Base: `new-origin/main`
- Scope: analytics surfaces, backend aggregation routers, storage reads, frontend routing/model

## What is being audited

Analytics in ProcessMap is implemented as query-string surfaces on `/app`:

| Surface | Query param | Status |
|---|---|---|
| Analytics hub | `?surface=analytics` | Static entry point |
| Product actions registry | `?surface=product-actions-registry` | **Backend-driven, multi-scope** |
| Process properties registry | `?surface=process-properties-registry` | Backend-driven, scope-limited |
| Dashboards | `?surface=dashboards` | Placeholder / thin aggregation |

The audit evaluates how far analytics is "backend-driven" (server produces numbers, frontend only renders) across workspace/project/session scopes, and what is required to make the remaining surfaces consistent.

## Findings summary

### ✅ What already works

1. **Product Actions Registry is the reference implementation**
   - `POST /api/analysis/product-actions/registry/query` accepts `scope = workspace|project|session`.
   - Backend validates scope, authz, loads minimal sources from `storage.list_product_action_registry_sources()`, extracts `interview.analysis.product_actions[]`, and returns rows + session summaries + filter options + metrics + empty state + source state.
   - Exports to CSV/XLSX are server-side (`export.csv`, `export.xlsx`).
   - Session scope uses dedicated `GET /api/sessions/{id}/analysis/view-model`.
   - Completeness rule is enforced in one place: `productActionsRegistryModel.REQUIRED_BUSINESS_FIELDS` on the frontend and `_REQUIRED_BUSINESS_FIELDS` in `product_actions_registry.py`.
   - `source_state` object tells the UI exactly what was scanned and that mutation is not allowed.

2. **Process Properties Registry has the same shape**
   - `POST /api/analysis/properties/registry/query` returns the same envelope (`rows`, `sessions`, `session_summary`, `filter_options`, `metrics`, `empty_state`, `source_state`).
   - Rows are extracted server-side from `bpmn_meta.camunda_extensions_by_element_id` and enriched with BPMN XML element type/title.
   - Exports exist.

3. **Dashboard endpoints exist for all three scopes**
   - `GET /api/sessions/{id}/analytics`
   - `GET /api/projects/{id}/analytics`
   - `GET /api/workspaces/{id}/analytics`
   - All use `compute_analytics()` or `_aggregate_sessions()`.

### ⚠️ Gaps and risks

1. **Process Properties Registry only shows *used* Camunda properties**
   - It never joins the org property dictionary (`org_property_dictionary_operations / defs / values`).
   - The dictionary is a separate admin CRUD surface; there is no unified property catalog.
   - Result: the registry cannot answer "which org-defined properties are missing from diagrams".

2. **Dashboards are under-engineered for multi-scope analytics**
   - `AnalyticsDashboards.jsx` only shows four cards per scope.
   - No backend filter model, no pagination, no export, no session list, no source state.
   - Project/workspace endpoints load full session objects from storage and recompute analytics on every request if `session.analytics` is missing; no materialized read model.
   - Workspace analytics caps at 500 deduplicated sessions and 20 recent sessions.

3. **Analytics computation is coupled to legacy code and full session hydration**
   - `compute_analytics()` reads `session.nodes`, `session.edges`, `session.questions`.
   - `project_analytics.py` and `_legacy_main.py` call `storage.load()` per session.
   - Aggregation is O(sessions × nodes) and runs in the request thread.

4. **Inconsistent authz and response contracts**
   - `product_actions_registry.py` and `process_properties_registry.py` use `require_authenticated_user` + `request_active_org_id` + `require_org_member_for_enterprise`.
   - `project_analytics.py` imports private `_legacy_main` helpers (`_request_active_org_id`, `_enterprise_require_org_member`, `_project_scope_for_request`) and mixes JSON-error returns with FastAPI exceptions.
   - `source_state` shape differs slightly between registries and is absent for dashboards.

5. **Frontend duplication and incomplete UX**
   - Two copies of product-actions registry components exist: `features/analytics/` (active) and `components/process/analysis/` (legacy).
   - `PropertiesRegistry.jsx` has no scope switcher; it derives scope from props.
   - `AnalyticsDashboards.jsx` has no scope switcher and no link to registries.
   - `AnalyticsHub` disables dashboards with "Будет позже".

6. **No materialized analytics tables**
   - `sessions.analytics_json` is written but only when a session is explicitly recomputed.
   - There are no tables for pre-aggregated project/workspace metrics or registry rows.
   - Large workspaces will hit CPU and I/O limits as session counts grow.

## Risk matrix

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Workspace aggregation becomes too slow | High | High | Materialize analytics; add async/cache layer |
| Org property dictionary stays isolated | Medium | High | Merge dictionary into property registry read model |
| Dashboards remain a placeholder | Medium | Medium | Build backend view-model and unified scope switcher |
| Authz inconsistency causes data leaks | High | Low | Refactor project/workspace analytics to use shared authz helpers |
| Frontend legacy code drift | Low | High | Delete `components/process/analysis` registry copies after tests confirm usage |

## Recommendations (priority order)

1. **Create a materialized analytics read model** (tables + projection) before expanding dashboard features.
2. **Unify the scope/context bar** across hub, registries, and dashboards so users can switch scope without losing context.
3. **Merge org property dictionary** into the process properties registry backend so it can show expected vs. actual properties.
4. **Convert dashboards to backend view-model endpoints** with `source_state`, filtering, and export parity.
5. **Refactor `project_analytics.py`** to use the same authz helpers as the registries and return consistent envelopes.
6. **Delete or redirect legacy frontend registry components** under `components/process/analysis/`.

## Files reviewed

- `backend/app/routers/product_actions_registry.py`
- `backend/app/routers/process_properties_registry.py`
- `backend/app/routers/project_analytics.py`
- `backend/app/routers/org_property_dictionary.py`
- `backend/app/analytics.py`
- `backend/app/_legacy_main.py` (session analytics endpoint)
- `backend/app/storage.py` (`sessions` schema, `list_product_action_registry_sources`, `list_process_properties_registry_sources`, org property dictionary tables)
- `backend/app/routers/__init__.py`
- `frontend/src/features/analytics/AnalyticsHub.jsx`
- `frontend/src/features/analytics/AnalyticsDashboards.jsx`
- `frontend/src/features/analytics/PropertiesRegistry.jsx`
- `frontend/src/features/analytics/ProductActionsRegistry.jsx` / `ProductActionsRegistryPanel.jsx`
- `frontend/src/features/analytics/dashboardModel.js`
- `frontend/src/features/analytics/useAnalyticsRouteState.js`
- `frontend/src/app/processMapRouteModel.js`
- `frontend/src/components/ProcessStage.jsx`
