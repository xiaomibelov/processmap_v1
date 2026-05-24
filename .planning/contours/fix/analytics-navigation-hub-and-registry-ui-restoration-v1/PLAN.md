# PLAN — fix/analytics-navigation-hub-and-registry-ui-restoration-v1

- **contour**: `fix/analytics-navigation-hub-and-registry-ui-restoration-v1`
- **run_id**: `20260521T120234Z-94291`
- **branch_from**: `origin/main` (5affb5f)
- **scope**: Frontend-only restoration of analytics hub styling and properties registry navigation wiring.
- **execution_mode**: single-lane (TOKEN_ECONOMY_SINGLE_EXECUTOR)

## Problem Statement

Commit `6205e0e` introduced `ProcessAnalyticsHub.jsx` and `ProcessPropertiesRegistryPage.jsx`, but the corresponding CSS rules were never added to `tailwind.css`, and the properties registry surface was never wired into `ProcessStage.jsx` route state management. Result:

1. **Analytics Hub renders completely unstyled** — no `.processAnalyticsHub*` CSS rules exist in `tailwind.css`.
2. **Properties Registry page exists but is unreachable** — no route model helpers, no `ProcessStage.jsx` import/render, no `onOpenPropertiesRegistry` passed to `ProcessAnalyticsHub`.
3. **Tests document the broken state** — `ProcessAnalyticsHub.test.mjs` test 13 asserts CSS is missing; `ProcessPropertiesRegistryPage.test.mjs` tests 4–5 fail on missing route model and stale version expectation.

## Evidence

- `grep -c "\.processAnalyticsHubPage" frontend/src/styles/tailwind.css` → 0
- `grep "ProcessPropertiesRegistryPage" frontend/src/components/ProcessStage.jsx` → no matches
- `grep "PROCESS_PROPERTIES_REGISTRY_SURFACE" frontend/src/app/processMapRouteModel.js` → no matches
- `node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs` → 2 failures (test 18, 19)

## Goals

1. Restore analytics hub scoped CSS in `tailwind.css`.
2. Restore properties registry scoped CSS in `tailwind.css` (key classes that are used without `productActionsRegistry*` fallback).
3. Add properties registry route model helpers in `processMapRouteModel.js`.
4. Wire `ProcessPropertiesRegistryPage` into `ProcessStage.jsx` with full route state lifecycle.
5. Pass `onOpenPropertiesRegistry` to `ProcessAnalyticsHub`.
6. Update tests to assert the restored state.
7. Verify build passes and runtime renders correctly.

## Non-Goals

- No backend changes (router already exists and is wired).
- No changes to `ProductActionsRegistryPanel.jsx` or `ProductActionsRegistryPage.jsx`.
- No changes to `WorkspaceExplorer.jsx` (analytics hub navigation already works).
- No AppShell/TopBar analytics surface detection (out of scope, tests explicitly forbid it).
- No broad refactor of tailwind.css.

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/styles/tailwind.css` | Add `.processAnalyticsHub*` and `.processPropertiesRegistry*` rules |
| `frontend/src/app/processMapRouteModel.js` | Add `PROCESS_PROPERTIES_REGISTRY_SURFACE`, `readProcessPropertiesRegistryRoute`, `buildProcessPropertiesRegistryUrl`, `buildProcessPropertiesRegistryCloseUrl` |
| `frontend/src/components/ProcessStage.jsx` | Import `ProcessPropertiesRegistryPage`, add route state/callbacks, render conditionally, pass `onOpenPropertiesRegistry` to `ProcessAnalyticsHub` |
| `frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs` | Flip test 13 to assert CSS EXISTS |
| `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs` | Update test 5 to current version v1.0.141 and add changelog entry |
| `frontend/src/config/appVersion.js` | Bump to v1.0.142, add changelog entry |

## Acceptance Criteria

- [ ] `npm run build` succeeds with no new warnings.
- [ ] `node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs` → all pass.
- [ ] `node --test src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs` → all pass.
- [ ] `grep -c "\.processAnalyticsHubPage" frontend/src/styles/tailwind.css` ≥ 1.
- [ ] `grep -c "PROCESS_PROPERTIES_REGISTRY_SURFACE" frontend/src/app/processMapRouteModel.js` ≥ 1.
- [ ] `grep -c "ProcessPropertiesRegistryPage" frontend/src/components/ProcessStage.jsx` ≥ 2 (import + render).
- [ ] Runtime proof: screenshot of analytics hub at `:5180` shows styled surface with 3 module cards.
- [ ] Runtime proof: clicking "Реестр свойств → Открыть" navigates to properties registry surface.
- [ ] Runtime proof: properties registry renders with table headers and scoped styling.

## Execution Split

Single-lane. All changes are frontend-only and interdependent (CSS + routing + wiring). Agent 3 runs shell-only merge/finalization.
