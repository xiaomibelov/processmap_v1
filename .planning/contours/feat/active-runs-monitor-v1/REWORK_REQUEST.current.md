# Rework Request: feat/active-runs-monitor-v1

- run_id: `20260522T160309Z-89364`
- reviewer: Agent 4
- generated_at: `2026-05-22T16:25Z`

## Required Change

### Remove out-of-scope line from `frontend/src/lib/apiRoutes.js`

**Location:** `frontend/src/lib/apiRoutes.js`, inside `analysis` object.

**Remove:**
```js
productActionsRegistryViewModel: () => "/api/analysis/product-actions/registry",
```

This line was added outside the bounded scope of `feat/active-runs-monitor-v1`. The PLAN.md explicitly scoped changes to:
- `admin.agentRuns()` route helper (already present on the `admin` object)

No other `analysis` routes were requested.

## Verification After Fix

1. `git diff --check` must pass.
2. `cd frontend && npm run build` must pass.
3. Only the following files should remain modified/new:
   - `backend/app/routers/admin.py`
   - `backend/tests/test_admin_agent_runs.py`
   - `frontend/src/app/router/adminRoutes.jsx`
   - `frontend/src/features/admin/AdminApp.jsx`
   - `frontend/src/features/admin/api/adminApi.js`
   - `frontend/src/features/admin/api/adminAgentRunsApi.js`
   - `frontend/src/features/admin/constants/adminNav.js`
   - `frontend/src/features/admin/constants/adminRoutes.constants.js`
   - `frontend/src/features/admin/constants/adminStatusMeta.js`
   - `frontend/src/features/admin/pages/AdminAgentRunsPage.jsx`
   - `frontend/src/features/admin/pages/AdminAgentRunsPage.test.mjs`
   - `frontend/src/lib/apiModules/adminApi.js`
   - `frontend/src/lib/apiRoutes.js`
   - `frontend/src/shared/i18n/ru.js`

## No Other Changes Required

All backend logic, frontend page, tests, i18n, nav, and route registration are correct. Only the single out-of-scope line needs removal.
