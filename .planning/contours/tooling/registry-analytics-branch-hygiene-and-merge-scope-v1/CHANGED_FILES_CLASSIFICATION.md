# CHANGED_FILES_CLASSIFICATION

Контур: `tooling/registry-analytics-branch-hygiene-and-merge-scope-v1`

Каждый tracked dirty файл отнесён ровно к одной категории.

| File | Class | Merge-scope decision | Rationale |
|---|---|---|---|
| `frontend/src/app/processMapRouteModel.js` | A. KEEP_ANALYTICS_HUB | include | Добавляет `analytics` surface route helpers и return path для перехода Hub -> Registry. |
| `frontend/src/components/AppShell.jsx` | A. KEEP_ANALYTICS_HUB | include | Передаёт состояние analytics surface в shell/top navigation. |
| `frontend/src/components/ProcessStage.jsx` | A. KEEP_ANALYTICS_HUB | include | Подключает `ProcessAnalyticsHub`, open/close analytics route и return flow в Registry. |
| `frontend/src/components/TopBar.jsx` | A. KEEP_ANALYTICS_HUB | include | Навигационный entry point для analytics surface. |
| `frontend/src/components/process/BpmnStage.jsx` | F. UNRELATED_OR_UNSAFE | exclude | BPMN/diagram runtime lane, не нужен для Analytics Hub/Registry merge scope. |
| `frontend/src/components/process/InterviewStage.jsx` | F. UNRELATED_OR_UNSAFE | exclude | Interview/diagram adjacent change, не нужен для текущего product scope. |
| `frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs` | B. KEEP_REGISTRY_REDESIGN | include | Focused page/route tests для Registry surface. |
| `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` | B. KEEP_REGISTRY_REDESIGN | include | Основной redesigned Registry panel. |
| `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs` | B. KEEP_REGISTRY_REDESIGN | include | Focused Registry panel tests. |
| `frontend/src/config/appVersion.js` | C. KEEP_VERSION_RUNTIME_PROOF | include if version proof remains required | Runtime-visible version marker `v1.0.137`; include only with build-info/version proof. |
| `frontend/src/features/explorer/WorkspaceExplorer.jsx` | A. KEEP_ANALYTICS_HUB | include | Entry/navigation from Explorer into Analytics Hub. |
| `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | F. UNRELATED_OR_UNSAFE | exclude | BPMN runtime/orchestration leftover. |
| `frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js` | F. UNRELATED_OR_UNSAFE | exclude | Diagram overlay/performance lane. |
| `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx` | F. UNRELATED_OR_UNSAFE | exclude | Diagram controls lane. |
| `frontend/src/styles/app/02/02-02-bpmn-viewer-core.css` | F. UNRELATED_OR_UNSAFE | exclude | BPMN viewer styling, outside Analytics/Registry merge scope. |
| `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css` | F. UNRELATED_OR_UNSAFE | exclude | BPMN dark theme styling, outside scope. |
| `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css` | F. UNRELATED_OR_UNSAFE | exclude | BPMN text contrast lane. |
| `frontend/src/styles/app/06-final-structure.css` | B. KEEP_REGISTRY_REDESIGN | include only if diff is Registry-specific | Shared stylesheet touched by Registry layout; re-check patch on clean branch. |
| `frontend/src/styles/legacy/legacy_bpmn.css` | F. UNRELATED_OR_UNSAFE | exclude | Legacy BPMN styling. |
| `frontend/src/styles/tailwind.css` | B. KEEP_REGISTRY_REDESIGN | include only after extracting/confirming Registry/Analytics selectors | Large shared stylesheet; likely contains needed Registry/Hub CSS but must be reviewed on clean branch to avoid importing unrelated selectors. |

## Tracked files excluded from product merge

Excluded tracked files are the BPMN, diagram runtime, overlay, and legacy styling changes listed as `F`. They should not be restored into the clean product branch unless a separate contour proves they are required.
