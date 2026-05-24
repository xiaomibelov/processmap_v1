# Executor Part 1 — fix/analytics-runtime-navigation-registry-ui-hard-restore-v1

- **run_id**: `20260521T204044Z-38151`
- **contour**: `fix/analytics-runtime-navigation-registry-ui-hard-restore-v1`
- **base**: `fix/analytics-navigation-hub-and-registry-ui-restoration-v1` (df33156)
- **branch**: `fix/analytics-runtime-navigation-registry-ui-hard-restore-v1`
- **mode**: single-lane (TOKEN_ECONOMY_SINGLE_EXECUTOR)

## Task

Fix the runtime `ReferenceError: onOpenAnalyticsHub is not defined` that occurs when clicking the analytics hub button in the workspace sidebar.

## Root Cause (verified)

In `frontend/src/features/explorer/WorkspaceExplorer.jsx`:
- `WorkspaceSidebar` (line ~1016) uses `onOpenAnalyticsHub?.({ workspaceId: activeWorkspaceId })` at line 1064.
- But `WorkspaceSidebar` does NOT declare `onOpenAnalyticsHub` in its function parameters.
- The root `WorkspaceExplorer` (line ~2746) receives `onOpenAnalyticsHub` as a prop but does NOT pass it to `WorkspaceSidebar` (line ~2805).

## Required Changes

### 1. `frontend/src/features/explorer/WorkspaceExplorer.jsx`
- Add `onOpenAnalyticsHub` to `WorkspaceSidebar` destructured props.
- Pass `onOpenAnalyticsHub={onOpenAnalyticsHub}` from root `WorkspaceExplorer` to `<WorkspaceSidebar ... />`.

### 2. `frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs`
- Test 10 currently only asserts `explorerSource.includes("onOpenAnalyticsHub")`. Strengthen it to assert that `WorkspaceSidebar` call site in `WorkspaceExplorer.jsx` passes `onOpenAnalyticsHub={onOpenAnalyticsHub}` (e.g. grep the `WorkspaceSidebar` JSX block for `onOpenAnalyticsHub=`).

### 3. `frontend/src/config/appVersion.js`
- Bump to `v1.0.143`.
- Add Russian changelog entry: `"Исправлена навигация в Аналитику из боковой панели (ReferenceError onOpenAnalyticsHub)."`

## Verification Steps

1. Build: `cd frontend && npm run build`
2. Tests: `node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs`
3. Grep check: `grep -c "onOpenAnalyticsHub" src/features/explorer/WorkspaceExplorer.jsx` must be ≥ 5.
4. Runtime proof (critical):
   - Start/reuse dev server or copy `dist/` to stage gateway.
   - Navigate to `http://clearvestnic.ru:5180/app`, log in as `admin@local` / `admin`.
   - Click sidebar button "Аналитика" (testid `workspace-analytics-hub-nav`).
   - **Must** open analytics hub with 3 module cards and NO console ReferenceError.
   - Click "Реестр свойств → Открыть".
   - **Must** navigate to properties registry surface.
   - Click "Вернуться".
   - **Must** return to analytics hub.
   - Save screenshots of each step.

## Git Discipline

- Create branch `fix/analytics-runtime-navigation-registry-ui-hard-restore-v1` from current HEAD (df33156).
- Atomic commits:
  1. `fix(explorer): pass onOpenAnalyticsHub to WorkspaceSidebar`
  2. `test: assert WorkspaceSidebar receives onOpenAnalyticsHub prop`
  3. `chore(version): bump to v1.0.143 for analytics navigation fix`
- Do not merge or push to main.
- Do not modify files outside the scope.
