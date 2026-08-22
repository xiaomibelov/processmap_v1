# Analytics backend-driven migration — input summary

## Source truth

- Repo: `/root/processmap_v1`
- Branch: `feature/analytics-backend-driven-v1`
- Base: `new-origin/main` (includes canvas PR #408 merge commit `6dae9058`)
- Audit artifacts: `.planning/contours/audit/analytics-backend-driven/`

## Answers from the audit

| Question | Answer from audit |
|---|---|
| **Working scope switcher?** | Product Actions Registry is the reference implementation. It uses `POST /api/analysis/product-actions/registry/query` with `scope = workspace \| project \| session` and has internal scope buttons. |
| **Missing scope switcher?** | Properties Registry and Dashboards have no scope switcher; scope is derived from props or not exposed at all. |
| **Existing endpoints** | `POST /api/analysis/product-actions/registry/query`<br>`GET /api/sessions/{id}/analysis/view-model`<br>`POST /api/analysis/properties/registry/query`<br>`GET /api/sessions/{id}/analytics`<br>`GET /api/projects/{id}/analytics`<br>`GET /api/workspaces/{id}/analytics`<br>Org property dictionary CRUD (`/api/orgs/{org_id}/property-dictionary/...`) |
| **Missing endpoints / gaps** | 9 gaps from `API_GAP.md`:<br>1. Dashboards lack registry-style envelope (`rows`, `filter_options`, `metrics`, `empty_state`, `source_state`).<br>2. No unified analytics query endpoint (`POST /api/analysis/query`).<br>3. Property registry does not join org property dictionary (no expected-vs-actual view).<br>4. Dashboards have no CSV/XLSX export.<br>5. Analytics computation is not materialized (recomputed on demand).<br>6. Authz is inconsistent across endpoints.<br>7. No async/cache layer for large workspace roll-ups.<br>8. Frontend API wrappers are surface-specific.<br>9. Scope switching is not an API concept. |
| **Relevant DB tables** | `sessions` (`interview_json`, `bpmn_meta_json`, `bpmn_xml`, `nodes_json`, `edges_json`, `questions_json`, `analytics_json`), `projects`, `workspaces`, `workspace_folders`, `org_property_dictionary_operations`, `org_property_dictionary_defs`, `org_property_dictionary_values` |
| **What frontend computes now** | Dashboard cards from session/project/workspace analytics endpoints; property registry client-side search/filter over backend rows; action registry derives rows from `interview.analysis.product_actions`. |
| **Missing read model** | Materialized analytics snapshots: `analytics_session_snapshots`, `analytics_project_snapshots`, `analytics_workspace_snapshots`, plus `analytics_metrics` for KPI history. |

## Implied target architecture

1. **Materialize first** — add snapshot tables and refresh them on every session save/recompute.
2. **Unified backend API** — new `/api/analytics/...` endpoints with consistent `{ success, data, meta }` envelope.
3. **Unified authz** — single `require_analytics_scope` helper.
4. **Path-based frontend routing** — `/analytics/:scope/:id` with tab query param.
5. **Adapt, don't delete** — reuse `AnalyticsHub`, `PropertiesRegistry`, `ProductActionsRegistryPanel`, `AnalyticsDashboards`.
6. **Org dictionary integration** — property registry shows all definitions with usage counts and org/project badges.
7. **Export + URL filters** — CSV export and query-param persisted filters.
