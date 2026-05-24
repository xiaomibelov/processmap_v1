# REVIEWER PROMPT — fix/analytics-navigation-hub-and-registry-ui-restoration-v1

- **contour**: `fix/analytics-navigation-hub-and-registry-ui-restoration-v1`
- **run_id**: `20260521T120234Z-94291`
- **base**: `origin/main` (5affb5f)
- **branch_under_review**: `fix/analytics-navigation-hub-and-registry-ui-restoration-v1`

## Review Checklist

### 1. Source Truth Verification
- [ ] Branch was created from `origin/main` at 5affb5f.
- [ ] Only files listed in PLAN.md were modified.
- [ ] No changes to `backend/`, `WorkspaceExplorer.jsx`, `ProductActionsRegistryPanel.jsx`, `AppShell.jsx`, `TopBar.jsx`.

### 2. CSS Verification
- [ ] `frontend/src/styles/tailwind.css` contains `.processAnalyticsHubPage`, `.processAnalyticsHubSurface`, `.processAnalyticsHubHeader`, `.processAnalyticsHubModules`, `.processAnalyticsHubModule`, `.processAnalyticsHubPlaceholder`.
- [ ] `frontend/src/styles/tailwind.css` contains `.processPropertiesRegistryPage`, `.processPropertiesRegistryScope`, `.processPropertiesRegistryMetrics`, `.processPropertiesRegistryFilters`, `.processPropertiesRegistryTable`, `.processPropertiesRegistryTableHead`, `.processPropertiesRegistryRow`, `.processPropertiesRegistryEmpty`, `.processPropertiesRegistrySourceTruth`.
- [ ] Responsive rule `@media (max-width: 980px) { .processAnalyticsHubModules { grid-template-columns: 1fr; } }` is present.
- [ ] No duplicate or conflicting CSS rules introduced.

### 3. Route Model Verification
- [ ] `PROCESS_PROPERTIES_REGISTRY_SURFACE = "process-properties-registry"` is exported.
- [ ] `readProcessPropertiesRegistryRoute`, `buildProcessPropertiesRegistryUrl`, `buildProcessPropertiesRegistryCloseUrl` are exported and follow the same patterns as product-actions-registry equivalents.

### 4. ProcessStage Wiring Verification
- [ ] `ProcessPropertiesRegistryPage` is imported.
- [ ] `propertiesRegistryRoute` state exists with `popstate` sync.
- [ ] `openPropertiesRegistry` and `closePropertiesRegistry` callbacks exist and mirror `openProductActionsRegistry`/`closeProductActionsRegistry` logic.
- [ ] `ProcessAnalyticsHub` receives `onOpenPropertiesRegistry` prop in both render branches.
- [ ] `ProcessPropertiesRegistryPage` is rendered in both `!hasSession` and `hasSession` branches when `propertiesRegistryRoute.active` is true.
- [ ] `closePropertiesRegistry` handles `return_to=analytics` correctly.

### 5. Test Verification
- [ ] `ProcessAnalyticsHub.test.mjs` test 13 asserts CSS EXISTS (not missing).
- [ ] `ProcessPropertiesRegistryPage.test.mjs` test 5 matches `v1.0.142`.
- [ ] Both test files pass: `node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs`.

### 6. Build Verification
- [ ] `npm run build` succeeds with no new errors.

### 7. Runtime Verification (5 planes)
- [ ] **Code**: branch `fix/analytics-navigation-hub-and-registry-ui-restoration-v1` exists with expected commits.
- [ ] **Workspace**: working directory is on the review branch.
- [ ] **DB**: no DB migrations required (frontend-only contour).
- [ ] **Env/Compose**: gateway container rebuilt and serving updated build.
- [ ] **Serving mode**: `curl -I http://clearvestnic.ru:5180` returns 200 with recent `Last-Modified`.
- [ ] **Runtime screenshot**: analytics hub shows styled white surface with 3 module cards.
- [ ] **Runtime screenshot**: properties registry opens from hub and shows styled table.

## Verdict Rules

- `PASS` only if all checklist items above are satisfied.
- `CHANGES_REQUESTED` if any CSS, routing, or wiring item is incorrect or incomplete.
- `BLOCKED` if runtime proof is missing or build fails.
- Do NOT approve based on code reading alone — runtime screenshots are required.
