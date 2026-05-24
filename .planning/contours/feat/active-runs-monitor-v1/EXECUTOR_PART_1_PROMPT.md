# Executor Prompt: feat/active-runs-monitor-v1

## Goal

Deliver the bounded contour exactly as described in `PLAN.md`.

## Source Truth Commands

Run before editing:

```bash
cd /opt/processmap-test
pwd
git remote -v
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status -sb
git log --oneline -15 origin/main
```

**CRITICAL**: If the current branch is NOT `feat/active-runs-monitor-v1`, create it from `origin/main`:

```bash
git checkout -b feat/active-runs-monitor-v1 origin/main
```

Do NOT work on `uiux/registry-ui-spec-implementation-v1` or any other branch.

## GSD Local Requirement

Use local GSD scripts if available. Record what was found and used in `EXEC_REPORT.md`.

## Scope

Read `PLAN.md`. Change only the files listed there.

### Backend

Add `GET /api/admin/agent-runs` to `backend/app/routers/admin.py`.

Implementation notes:
- Root path: read from env `PROCESSMAP_REPO_ROOT` or default to `/opt/processmap-test`
- Scan directory: `{root}/.agents/run-state/`
- For each subdirectory (run_id):
  - Read `CID` file → `contour_id`
  - Check `STOP_REQUESTED` file existence → `stop_requested: bool`
  - List `scripts/agent-{N}-{pid}.sh` files → extract agent numbers and pids
  - Check most recent `kimi-agent-{N}-{ts}.log` mtime → `last_activity_at` (unix timestamp)
  - Check `highlight-agent-{N}.token` files → active agents
- Status logic:
  - `active` if no STOP_REQUESTED and last_activity_at within last 5 minutes
  - `stopping` if STOP_REQUESTED exists
  - `completed` otherwise
- Return shape:
  ```json
  {
    "ok": true,
    "generated_at": "...",
    "runs": [
      {
        "run_id": "20260522T160309Z-89364",
        "contour_id": "feat/active-runs-monitor-v1",
        "status": "active",
        "stop_requested": false,
        "started_at": 1779465789,
        "last_activity_at": 1779465856,
        "agents": [
          { "agent": "1", "pid": "904", "highlight": true },
          { "agent": "2", "pid": "1987", "highlight": false }
        ]
      }
    ],
    "count": 1
  }
  ```
- Use existing `_admin_context` for auth/permissions (same as other admin endpoints)
- Reuse `_now_iso`, `_as_text`, `_as_int` helpers already in the file

### Frontend

1. **API routes** (`frontend/src/lib/apiRoutes.js`):
   Add `agentRuns: () => "/api/admin/agent-runs"` inside `admin` object.

2. **API module** (`frontend/src/lib/apiModules/adminApi.js`):
   Add `apiAdminListAgentRuns()` function following existing pattern.

3. **Admin constants** (`frontend/src/features/admin/constants/adminRoutes.constants.js`):
   Add `agentRuns: "agent-runs"` to `ADMIN_SECTIONS` and entry to `ADMIN_ROUTE_META`.

4. **Admin nav** (`frontend/src/features/admin/constants/adminNav.js`):
   Add nav item after `aiModules` or before `rag`.

5. **Admin routes** (`frontend/src/app/router/adminRoutes.jsx`):
   Add `{ path: ADMIN_ROUTE_META.agentRuns.path, section: "agent-runs" }`.

6. **Data hook** (`frontend/src/features/admin/api/adminAgentRunsApi.js`):
   Create hook `useAdminAgentRunsData()` that calls `apiAdminListAgentRuns()`.

7. **Page** (`frontend/src/features/admin/pages/AdminAgentRunsPage.jsx`):
   - Use `AdminPageContainer`, `AdminPageHeader`
   - Table columns: Run ID, Contour, Status, Agents, Started, Last Activity, Stop Requested
   - Status pill using existing `StatusPill` component (map `active`→green, `stopping`→yellow, `completed`→gray)
   - Empty state: "Нет активных запусков агентов"
   - Loading: `LoadingBlock`

8. **AdminApp** (`frontend/src/features/admin/AdminApp.jsx`):
   - Import new page and hook
   - Add switch case for `agent-runs` section

9. **i18n** (`frontend/src/shared/i18n/ru.js`):
   Add Russian labels under `admin.nav.agentRuns`, `admin.route.agentRuns.title/subtitle`, and table headers.

### Tests

- Backend: add a small test in `backend/tests/` or inline docstring test verifying the endpoint shape. If no test infra exists for admin endpoints, at minimum verify manually with curl.
- Frontend: `AdminAgentRunsPage.test.mjs` with render test and empty-state test.

## Non-goals

Do not change product frontend/backend code, DB/schema, BPMN XML save logic, AI/RAG/Product Actions logic, deployment, merge, or PR state unless `PLAN.md` explicitly allows it.

## Implementation Steps

1. Read `PLAN.md`.
2. Confirm source truth (clean branch from origin/main).
3. Apply the scoped edits.
4. Run validation listed in `PLAN.md`.
5. Write `EXEC_REPORT.md`.
6. Create marker `READY_FOR_REVIEW`.

## Tests

Run the focused commands from `PLAN.md`. Always run `git diff --check` unless the plan says why it is not applicable.

## Runtime Proof

Collect only the proof requested by `PLAN.md`:
1. `curl -s http://localhost:8088/api/admin/agent-runs | jq '.runs | length'`
2. Screenshot of `/admin/agent-runs` page

## Final Report Format

Write `EXEC_REPORT.md` with:

- Source truth (branch, HEAD, status)
- Files changed (git diff --name-only)
- Validation run (test results, build result)
- Runtime proof (curl output, screenshot path)
- Explicit unchanged areas
- Remaining risks
