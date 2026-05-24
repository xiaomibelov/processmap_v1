# Branch scope report

## Branch hygiene

- Dirty launcher tree was not used for product-code edits.
- Clean worktree created from current `origin/main`:
  - path: `/opt/processmap-test-agent2-uiux`
  - branch: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1-agent2`
  - base/head before edits: `d805e1c64c1107b9e3fe6854e031694bf741b187`

## Changed scope

Allowed frontend files changed:
- `frontend/src/app/processMapRouteModel.js`
- `frontend/src/components/AppShell.jsx`
- `frontend/src/components/ProcessStage.jsx`
- `frontend/src/components/TopBar.jsx`
- `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx`
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- `frontend/src/components/process/analysis/registry/**`
- `frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs`
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs`
- `frontend/src/features/explorer/WorkspaceExplorer.jsx`
- `frontend/src/styles/tailwind.css`
- `frontend/src/config/appVersion.js`

## Explicit non-goals respected

- Backend: not changed.
- Schema/migrations: not changed.
- BPMN XML mutation logic: not changed.
- RAG runtime: not changed.
- Package/lockfile: not changed.
- Global shell redesign: not done; only minimal TopBar/AppShell awareness for `surface=analytics`.
