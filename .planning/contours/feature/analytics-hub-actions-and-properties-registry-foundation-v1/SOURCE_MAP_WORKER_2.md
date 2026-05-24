# SOURCE_MAP_WORKER_2

Implementation worktree: `/opt/processmap-analytics-foundation-agent2`  
Branch: `feature/analytics-hub-actions-and-properties-registry-foundation-v1-agent2`

## Product files

- `frontend/src/app/processMapRouteModel.js` — route model for Analytics surface/modules and close URLs.
- `frontend/src/app/processMapRouteModel.test.mjs` — route model coverage for Analytics module nesting.
- `frontend/src/components/ProcessStage.jsx` — Analytics surface rendering and module navigation wiring.
- `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx` — top-level `Аналитика` hub.
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` — page-mode registry copy/behavior preservation.
- `frontend/src/components/process/analysis/PropertiesRegistryPage.jsx` — properties foundation and dashboards placeholder.
- `frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs` — source-level navigation/IA assertions.
- `frontend/src/components/process/interview/ProductActionsPanel.jsx` — entry copy points to inner registry.
- `frontend/src/config/appVersion.js` — version/update row.
- `frontend/src/features/explorer/WorkspaceExplorer.jsx` — explorer entry opens Analytics/product registry path.
- `frontend/src/features/navigation/appLinkBehavior.test.mjs` — backward-compatible link behavior coverage.
- `frontend/src/styles/tailwind.css` — Analytics hub/properties styles and white-container registry page visual rules.

## Out of scope

- No backend files.
- No database/schema files.
- No BPMN XML.
- No RAG runtime files.
