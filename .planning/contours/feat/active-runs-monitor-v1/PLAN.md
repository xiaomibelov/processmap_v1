# Plan: feat/active-runs-monitor-v1

## Goal

Add a read-only "Active Agent Runs" monitor to the Admin console. The backend scans `.agents/run-state/` and returns active runs with their agents, contour, and basic status. The frontend renders a dedicated admin page with a sortable table.

## Source Truth

- Repo: `/opt/processmap-test`
- Current branch: `uiux/registry-ui-spec-implementation-v1` (dirty, unrelated contour)
- HEAD: `5affb5ff0abce2735df1c34fe369a39fe9c354e3`
- Base truth: `origin/main` at `5affb5ff0abce2735df1c34fe369a39fe9c354e3`
- **BLOCKER RULE**: Executor MUST create a clean branch `feat/active-runs-monitor-v1` from `origin/main`. Do NOT commit on the current dirty `uiux/registry-ui-spec-implementation-v1` branch.
- Run id: `20260522T160309Z-89364`

## GSD Local Sources

- `gsd-fast` skill available for trivial inline tasks
- `gsd-health` available for planning directory health checks
- Local GSD bin: `/opt/processmap-test/bin/gsd`
- No specific GSD skill invocation required for this bounded feature

## UI/UX Design System

Use existing ProcessMap Admin design system (already established in `frontend/src/features/admin/`):
- Reuse `AdminPageContainer`, `AdminPageHeader`, `AdminTablePagination`
- Reuse `StatusPill`, `HealthBadge`, `EmptyState`, `LoadingBlock`
- Colors: semantic tokens from existing admin palette (no new raw hex)
- Table density matches `SessionsTable` / `JobsTable`
- No animation beyond standard 150ms CSS transitions

## Scope

### Backend (allowed)
- `backend/app/routers/admin.py` — add `GET /api/admin/agent-runs` endpoint

### Frontend (allowed)
- `frontend/src/lib/apiRoutes.js` — add `admin.agentRuns()` route helper
- `frontend/src/lib/apiModules/adminApi.js` — add `apiAdminListAgentRuns()`
- `frontend/src/features/admin/constants/adminRoutes.constants.js` — add `agentRuns` section
- `frontend/src/features/admin/constants/adminNav.js` — add nav item
- `frontend/src/app/router/adminRoutes.jsx` — add route path
- `frontend/src/features/admin/api/adminAgentRunsApi.js` — new hook/data layer
- `frontend/src/features/admin/pages/AdminAgentRunsPage.jsx` — new page
- `frontend/src/features/admin/AdminApp.jsx` — register page + data hook
- `frontend/src/shared/i18n/ru.js` — add Russian labels for nav + page

### Tests (allowed)
- `backend/app/routers/admin.py` — add backend tests (pytest-style inline or dedicated test file)
- `frontend/src/features/admin/pages/AdminAgentRunsPage.test.mjs` — render + empty-state tests

### Non-goals
- No heartbeat, webhook, or alert mechanism
- No "stop run" or "kill agent" actions (read-only)
- No log file streaming or tailing
- No DB/schema changes
- No product frontend/backend code outside admin surface
- No BPMN XML, AI/RAG, export, deploy, merge, or PR actions

## Implementation Steps

1. Create clean branch `feat/active-runs-monitor-v1` from `origin/main`.
2. Implement backend endpoint:
   - Scan `$ROOT/.agents/run-state/` directories
   - For each directory (run_id), read `CID`, `STOP_REQUESTED`, list script files
   - Return structured JSON: `{ runs: [{ run_id, contour_id, status, agents: [{ agent, pid }], started_at, stop_requested }] }`
   - Status logic: `active` if log files are newer than 5 min and no STOP_REQUESTED; `stopping` if STOP_REQUESTED exists; `completed` otherwise
3. Implement frontend:
   - Add route, nav, API helpers, i18n labels
   - Build page with table showing run_id, contour, status pill, agent list, started_at, stop flag
   - Add empty state when no runs
   - Add loading skeleton
4. Add tests:
   - Backend: test endpoint returns list shape, handles missing run-state gracefully
   - Frontend: render test, empty-state test
5. Run validation:
   - `git diff --check`
   - `cd frontend && npm run test -- --run --testPathPattern="AdminAgentRunsPage"`
   - `cd backend && python -m pytest tests/ -k "agent_run" -x` (or equivalent)
   - Build check: `cd frontend && npm run build`

## Validation

- `git diff --check` passes
- Only scoped files changed
- Backend endpoint responds with 200 and correct JSON shape
- Frontend page renders in Admin shell without console errors
- No regression in existing admin pages

## Runtime Proof

1. `curl -s http://localhost:8088/api/admin/agent-runs | jq '.runs | length'` — returns count
2. Playwright or manual screenshot of `/admin/agent-runs` page showing table
3. Verify nav item "Запуски агентов" is visible in Admin sidebar

## Review Inputs

- `PLAN.md`
- `EXEC_REPORT.md`
- `git diff --stat`
- Runtime proof listed above
