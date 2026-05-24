# PLAN — fix/analytics-runtime-navigation-registry-ui-hard-restore-v1

- **contour**: `fix/analytics-runtime-navigation-registry-ui-hard-restore-v1`
- **run_id**: `20260521T204044Z-38151`
- **branch_from**: `fix/analytics-navigation-hub-and-registry-ui-restoration-v1` (df33156)
  - Rationale: the previous restoration branch (ahead of origin/main by 4 commits) contains CSS, routing, and ProcessStage wiring required for any runtime proof. The new bug is in `WorkspaceExplorer.jsx` which exists on both branches. Basing on the restored branch avoids re-cherry-picking reviewed work.
- **scope**: Frontend-only fix for analytics hub navigation ReferenceError, plus end-to-end runtime verification of analytics hub → properties registry flow.
- **execution_mode**: single-lane (TOKEN_ECONOMY_SINGLE_EXECUTOR)

## Problem Statement

Commit `dd1c535` (on `origin/main`) added analytics hub navigation buttons to `WorkspaceExplorer.jsx`. It wired `onOpenAnalyticsHub` into `ProjectPane` and the root `WorkspaceExplorer` component, but it **omitted the prop from `WorkspaceSidebar`**.

Result:
1. **Analytics hub button in workspace sidebar throws `ReferenceError: onOpenAnalyticsHub is not defined`** at runtime when clicked.
2. **Analytics hub is unreachable from the workspace view** — the only navigation path that works is direct URL (`?surface=analytics`).
3. **Properties registry is unreachable via normal UI flow** — it can only be opened from the analytics hub, which is itself unreachable via sidebar.

## Evidence

- Runtime console error (captured at `http://clearvestnic.ru:5180`):
  ```
  ReferenceError: onOpenAnalyticsHub is not defined
      at onClick (index-BXgcWRCA.js:56:263739)
  ```
- `grep -n "onOpenAnalyticsHub" frontend/src/features/explorer/WorkspaceExplorer.jsx` shows usage at line 1064 inside `WorkspaceSidebar`, but `WorkspaceSidebar` props (line 1016-1026) do not list `onOpenAnalyticsHub`.
- Root `WorkspaceExplorer` (line 2746-2755) receives `onOpenAnalyticsHub` but does **not** pass it to `WorkspaceSidebar` (line 2805-2815).
- Direct URL navigation to `?surface=analytics` renders correctly → proves CSS and component wiring are intact.
- Direct URL navigation to `?surface=process-properties-registry` renders correctly → proves registry page is functional.
- Clicking "Реестр свойств → Открыть" from analytics hub navigates correctly → proves hub-to-registry flow works once hub is reached.

## Goals

1. Fix `WorkspaceSidebar` to accept `onOpenAnalyticsHub` prop.
2. Fix root `WorkspaceExplorer` to pass `onOpenAnalyticsHub` to `WorkspaceSidebar`.
3. Update `ProcessAnalyticsHub.test.mjs` to assert that `WorkspaceSidebar` receives the prop (not just that the string exists in source).
4. Bump version and changelog.
5. Build passes, tests pass.
6. Runtime proof: sidebar analytics hub button opens the hub; hub → properties registry button opens the registry; back navigation works.

## Non-Goals

- No backend changes.
- No CSS changes (previous restoration already handled).
- No changes to `ProcessStage.jsx`, `processMapRouteModel.js`, or `tailwind.css`.
- No changes to `ProductActionsRegistryPanel/Page`.
- No broad refactor of `WorkspaceExplorer.jsx`.

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/features/explorer/WorkspaceExplorer.jsx` | Add `onOpenAnalyticsHub` to `WorkspaceSidebar` props; pass it from root `WorkspaceExplorer` to `WorkspaceSidebar` |
| `frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs` | Strengthen test 10 to assert `WorkspaceSidebar` prop wiring (e.g. grep `WorkspaceSidebar` call site for `onOpenAnalyticsHub=`) |
| `frontend/src/config/appVersion.js` | Bump to v1.0.143, add changelog entry |

## Acceptance Criteria

- [ ] `npm run build` succeeds with no new warnings.
- [ ] `node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs` → all pass.
- [ ] `node --test src/features/explorer/*.test.mjs` → all pass (or no new failures).
- [ ] `grep -c "onOpenAnalyticsHub" frontend/src/features/explorer/WorkspaceExplorer.jsx` ≥ 5 (prop declaration + 2 usages + 1 destructuring + 1 prop pass).
- [ ] Runtime proof: click sidebar "Аналитика" button opens analytics hub with 3 module cards.
- [ ] Runtime proof: click "Реестр свойств → Открыть" navigates to properties registry surface.
- [ ] Runtime proof: click "Вернуться" on properties registry returns to analytics hub.
- [ ] Runtime proof: no console ReferenceError when clicking sidebar analytics button.

## Execution Split

Single-lane. The fix is one file with a two-line prop change. Agent 3 runs shell-only merge/finalization.
