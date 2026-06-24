# Migration plan — backend-driven analytics

## Goal

Move analytics from on-demand JSON parsing to a backend-driven, multi-scope, materialized read model while keeping the registries working and improving dashboards.

## Principles

1. **Keep product actions registry working** — it is the reference surface.
2. **Materialize before generalizing** — add tables/projections before building a generic query engine.
3. **One authz path** — all analytics endpoints use the same dependency chain.
4. **One envelope** — registries and dashboards share `rows/sessions/summary/filter_options/metrics/empty_state/source_state`.
5. **Incremental delivery** — each phase can be merged independently.

---

## Phase 1 — Materialize session analytics

### Backend

1. Add table `analytics_session_snapshots` (see `DB_SCHEMA.md`).
2. Extend `storage.save_session()` to recompute and store `analytics_json` on every write that changes nodes/edges/questions.
3. Backfill existing sessions with a migration script:
   ```bash
   python -m backend.scripts.backfill_analytics --org-id=... --dry-run
   ```
4. Update `GET /api/sessions/{id}/analytics` to return the snapshot if fresh, else recompute synchronously.

### Validation

- Unit test: `compute_analytics()` output matches stored snapshot.
- Migration test: backfill script runs without errors on a copy of prod data.

### Frontend

- No changes required.

---

## Phase 2 — Build project/workspace roll-ups

### Backend

1. Add tables:
   - `analytics_project_rollups`
   - `analytics_workspace_rollups`
2. Create projection function `_update_project_rollup(project_id)` and `_update_workspace_rollup(workspace_id)`.
3. Trigger updates:
   - After session save (async queue or transaction hook).
   - After project/workspace CRUD.
4. Rewrite `project_analytics.py`:
   - Use shared authz helpers.
   - Read from roll-up tables.
   - Return the same envelope as registries (`summary`, `metrics`, `source_state`).
5. Keep fallback to on-demand aggregation when roll-up is stale/missing.

### Validation

- Compare roll-up values with on-demand aggregation for sample workspaces.
- Load test: 500 sessions workspace request < 200 ms.

### Frontend

- Update `dashboardModel.js` to consume the new envelope.
- Keep card rendering unchanged.

---

## Phase 3 — Unify property registry with org dictionary

### Backend

1. Extend `process_properties_registry.py`:
   - Load org property dictionary for the active operation(s).
   - Build expected vs. actual property rows.
   - Add `property_source` field: `expected`, `actual`, `expected_and_actual`.
   - Add filter options from dictionary definitions.
2. Add optional query flag `include_expected` (default `true`).
3. Update `source_state` to report dictionary coverage.

### Validation

- Test that a property defined in the dictionary but absent from BPMN appears as `expected`.
- Test export includes expected rows.

### Frontend

1. Add scope switcher to `PropertiesRegistry.jsx`.
2. Add status badges for expected/actual.
3. Update empty states to explain expected properties.

---

## Phase 4 — Make dashboards a first-class report

### Backend

1. Add `POST /api/analysis/dashboards/query`:
   - Accepts `scope`, `workspace_id`, `project_id`, `session_id`, `filters`, `limit`, `offset`.
   - Returns registry-style envelope with per-session rows and aggregate cards.
2. Add `POST /api/analysis/dashboards/export.{csv,xlsx}`.
3. Refactor existing `GET` endpoints to thin wrappers over the new query handler.

### Validation

- Contract tests for the new endpoint.
- Export tests for all scopes.

### Frontend

1. Create `apiQueryAnalyticsDashboards()` wrapper.
2. Add scope switcher and filter bar to `AnalyticsDashboards.jsx`.
3. Enable the dashboards card in `AnalyticsHub.jsx`.
4. Delete or redirect legacy `components/process/analysis/ProcessAnalyticsHub.jsx`.

---

## Phase 5 — Unified analytics query endpoint

### Backend

1. Add `POST /api/analysis/query` router:
   - `report_type`: `product_actions`, `properties`, `dashboards`.
   - `scope`: `workspace`, `project`, `session`.
   - Delegates to existing registry handlers to avoid duplication.
2. Add `GET /api/analysis/scope-context` returning available scopes and entity titles.
3. Mark old endpoint families as deprecated in OpenAPI tags.

### Validation

- Regression tests for all old endpoints.
- New endpoint parity tests.

### Frontend

1. Add `apiQueryAnalytics({ reportType, scope, ... })` wrapper.
2. Migrate `ProductActionsRegistryPanel` and `PropertiesRegistry` to use it.
3. Introduce `AnalyticsScopeBar` shared component.

---

## Phase 6 — Cleanup and hardening

### Backend

1. Remove `_legacy_main.get_session_analytics` or make it a thin wrapper.
2. Add composite indexes:
   - `sessions(org_id, workspace_id, updated_at)`
   - `sessions(org_id, project_id, updated_at)`
   - `projects(org_id, workspace_id)`
3. Add rate limiting / query cost metrics for large workspace queries.
4. Add caching (Redis or in-memory TTL) for roll-up reads.

### Frontend

1. Delete `components/process/analysis/ProductActionsRegistry*` and `ProcessAnalyticsHub*` if no route imports them.
2. Add TypeScript/JSDoc types for the unified envelope.
3. Add analytics-specific e2e tests for scope switching.

---

## Migration sequence diagram

```
Phase 1        Phase 2          Phase 3          Phase 4          Phase 5          Phase 6
  │              │                │                │                │                │
  ▼              ▼                ▼                ▼                ▼                ▼
materialize   project/workspace  merge org        dashboards as    unified query    cleanup
session       roll-ups           dictionary       backend report   endpoint         & indexes
analytics                        into property
                                 registry
```

---

## Rollback plan

- Each phase keeps old endpoints functional until the next phase.
- Roll-ups can be recomputed from `analytics_session_snapshots`.
- If unified endpoint has issues, frontend can revert to surface-specific wrappers.

---

## Definition of done

- [ ] All analytics endpoints return the same envelope shape.
- [ ] Workspace dashboard loads in < 200 ms for 500 sessions.
- [ ] Property registry shows expected properties from org dictionary.
- [ ] Dashboards card is enabled in the analytics hub.
- [ ] Scope switcher works consistently across hub, registries, and dashboards.
- [ ] Legacy registry components are removed.
- [ ] E2E tests cover scope switching and export.
