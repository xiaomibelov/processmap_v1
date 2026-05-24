# Reviewer Prompt: ui/analytics-inter-registry-navigation-v1

## Goal

Peer review the inter-registry navigation contour.

## Source Truth Commands

```bash
cd /opt/processmap-test
pwd
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status -sb
git diff --name-only
git diff --check
```

## Review Scope

Read:
- `PLAN.md`
- `EXEC_REPORT.md`
- Changed files from `git diff`
- Runtime proof referenced in `EXEC_REPORT.md`

## Checks

1. **Route model**: `PROCESS_PROPERTIES_REGISTRY_SURFACE`, `readProcessPropertiesRegistryRoute`, `buildProcessPropertiesRegistryUrl`, `buildProcessPropertiesRegistryCloseUrl` exist and mirror the product-actions pattern.
2. **ProcessStage**: imports `ProcessPropertiesRegistryPage`, has `propertiesRegistryRoute` state, `openPropertiesRegistry`/`closePropertiesRegistry` callbacks, renders the page in both `!hasSession` and `hasSession` branches.
3. **Prop drilling**: `onOpenPropertiesRegistry` passed to `ProcessAnalyticsHub` and `ProductActionsRegistryPage`; `onOpenProductActionsRegistry` passed to `ProcessPropertiesRegistryPage`.
4. **UI switchers**: `RegistryHeader` renders switcher button when prop provided; `ProcessPropertiesRegistryPage` renders "Реестр действий" button.
5. **Scope preservation**: URL params (workspace, project, session, scope) maintained when switching.
6. **Tests pass**: `ProcessPropertiesRegistryPage.test.mjs` and `ProcessAnalyticsHub.test.mjs` pass.
7. **Build passes**: `npm run build` 0 errors.
8. **Runtime proof**: screenshots show direct switching works both directions.
9. **No scope creep**: no backend, CSS, data logic, or shell changes.

## Verdict

- If all checks pass: `touch REVIEW_PASS`
- If changes required: `touch CHANGES_REQUESTED`, write `REVIEW_REPORT.md` with specific fixes.

Never create both markers.
