# [CRITICAL] Backend-driven analytics integration: legacy tabs → new routes

**PR:** https://github.com/xiaomibelov/processmap_v1/pull/411
**Branch:** `fix/analytics-integration-v1`
**Base:** `main`
**Merge strategy:** Create a merge commit (no squash, no rebase)

## Summary

Replaces legacy query-string analytics surfaces (`?surface=analytics`, `?surface=process-properties-registry`, `?surface=product-actions-registry`, `?surface=dashboards`) with backend-driven path routes `/analytics/:scope/:id/:module`.

## Changes

### Backend
- `backend/app/routers/analytics.py`
  - Fixed broken imports: properties/actions rows now use `get_storage().list_*_registry_sources` and reuse existing registry extraction helpers.
  - Mapped extracted rows to canonical fields for the new analytics API.
  - Added `usage_count` to properties rows and CSV export.
  - Filter option keys aligned with frontend panel expectations (`type`, `category`, `source`, `section`, `role`).

### Frontend
- `frontend/src/features/analytics/useAnalyticsRouteState.js` — navigation now pushes `/analytics/:scope/:id/:module` paths.
- `frontend/src/components/ProcessStage.jsx` — session drill-in from product-actions registry navigates to `/analytics/session/:id/actions`.
- `frontend/src/components/AppShell.jsx` and `frontend/src/features/topbar/TopBarContainer.jsx` — TopBar analytics button opens the new route and highlights when active.
- `frontend/src/RootApp.jsx` — legacy `?surface=...` URLs on `/app` redirect to the new path.
- `frontend/src/features/navigation/appLinkBehavior.js` — product-actions registry links now return `/analytics/.../actions`.
- `frontend/src/features/analytics/AnalyticsPage.jsx`
  - Real `AnalyticsDashboardsPanel` with metric cards and bar charts.
  - CSV export buttons for actions and properties panels.
  - `usage_count` column in properties table.

### Tests
- Updated `useAnalyticsRouteState.test.mjs` and `appLinkBehavior.test.mjs` for path routes.

## Verification

- `npm run build` — PASS
- `node --test src/**/*.test.mjs` — 227/227 PASS
- `pytest tests/test_analytics_backend_driven.py -q` — 6/6 PASS
- Full backend suite — 459 passed / 161 failed (pre-existing baseline, not regressed)

## Dependency

- Canvas overlay fix #548 must remain intact after deploy.
