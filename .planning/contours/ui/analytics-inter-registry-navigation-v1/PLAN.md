# PLAN — ui/analytics-inter-registry-navigation-v1

- **run_id**: `20260522T152523Z-63480`
- **contour**: `ui/analytics-inter-registry-navigation-v1`
- **mode**: TOKEN_ECONOMY_SINGLE_EXECUTOR
- **branch**: `uiux/registry-ui-spec-implementation-v1`
- **HEAD**: `5affb5ff0abce2735df1c34fe369a39fe9c354e3`

## Context

The main inter-registry navigation feature (bidirectional switching between Product Actions Registry and Process Properties Registry) was implemented and reviewed successfully in the previous run (`20260522T143211Z-74855`, verdict `REVIEW_PASS`).

This run is a polish follow-up to close the one remaining reviewer note: the `.registrySwitchBtn` CSS class has no explicit styling. The button is currently visible only via default light text against the dark background. This contour adds proper, intentional styling.

## Scope

### In scope
1. Add explicit CSS rules for `.registrySwitchBtn` in `frontend/src/styles/tailwind.css`.
2. Ensure the switch button visually matches the registry design system (compact, readable, consistent with `.registryExportBtn` and `.registryCloseBtn`).
3. Bump app version to `v1.0.143` and add changelog entry.
4. Update version assertions in test files.
5. Re-run all relevant tests and `npm run build`.
6. Runtime proof on `:5180` — verify the switch button is visible and styled in both registries.

### Out of scope
- No changes to routing, navigation logic, or component structure.
- No changes to `WorkspaceExplorer`, `AppShell`, or `TopBar`.
- No backend changes.
- No new features beyond CSS polish + version bump.

## Files to modify

| # | Path | Change |
|---|------|--------|
| 1 | `frontend/src/styles/tailwind.css` | Add `.registrySwitchBtn` styles |
| 2 | `frontend/src/config/appVersion.js` | Bump to `v1.0.143`, add changelog line |
| 3 | `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs` | Update version assertion |
| 4 | `frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs` | Update version assertion |

## Acceptance criteria

- [ ] `npm run build` passes with 0 errors.
- [ ] All 5 registry-related test files pass:
  - `ProcessPropertiesRegistryPage.test.mjs`
  - `ProcessAnalyticsHub.test.mjs`
  - `ProductActionsRegistryPage.test.mjs`
  - `ProductActionsRegistryPanel.test.mjs`
  - `registry/RegistryPage.test.mjs`
- [ ] `.registrySwitchBtn` has explicit styling in `tailwind.css` (not relying on browser defaults).
- [ ] Runtime proof screenshots show the switch button is clearly visible and styled on both registry pages.
- [ ] Version marker reads `v1.0.143`.
- [ ] No scope creep — only the 4 files above are modified.
