# MERGE_SCOPE_MANIFEST

Контур: `tooling/registry-analytics-branch-hygiene-and-merge-scope-v1`

## Minimal product merge candidate

### Analytics Hub / route / navigation

```text
frontend/src/app/processMapRouteModel.js
frontend/src/components/AppShell.jsx
frontend/src/components/ProcessStage.jsx
frontend/src/components/TopBar.jsx
frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx
frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs
frontend/src/features/explorer/WorkspaceExplorer.jsx
```

### Product Actions Registry redesign

```text
frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs
frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx
frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs
frontend/src/components/process/analysis/registry/ProductActionsRegistryFilters.jsx
frontend/src/components/process/analysis/registry/ProductActionsRegistryHeader.jsx
frontend/src/components/process/analysis/registry/ProductActionsRegistryMetrics.jsx
frontend/src/components/process/analysis/registry/ProductActionsRegistryPagination.jsx
frontend/src/components/process/analysis/registry/ProductActionsRegistryTable.jsx
frontend/src/components/process/analysis/registry/index.js
frontend/src/styles/app/06-final-structure.css
frontend/src/styles/tailwind.css
```

### Version/runtime proof candidate

Include only if the clean product branch is expected to preserve the reviewed runtime marker/build-info story:

```text
frontend/src/config/appVersion.js
frontend/public/build-info.json
frontend/src/generated/buildInfo.js
scripts/generate-build-info.mjs
```

## Explicit non-merge scope

```text
.agents/
.env.backup_20260514_095731
.playwright-mcp/
.planning/ outside accepted contour reports
PROCESSMAP/HANDOFF/
bin/
docs/rag/
scripts/capture-cpu-profile.mjs
scripts/obsidian-write.sh
tools/
root screenshots and runtime evidence files
frontend/runtime-review.mjs
frontend/src/components/process/BpmnStage.jsx
frontend/src/components/process/InterviewStage.jsx
frontend/src/features/process/bpmn/
frontend/src/features/process/hooks/useDiagramMutationLifecycle.non-edit-guard.test.mjs
frontend/src/features/process/stage/
frontend/src/styles/app/02/
frontend/src/styles/app/05/05-02-bpmn-text-contrast.css
frontend/src/styles/legacy/legacy_bpmn.css
```

## Manifest risk

`frontend/src/styles/tailwind.css` is a large shared stylesheet diff. It is merge-candidate only after clean-branch review proves the diff contains only Analytics/Registry selectors and no diagram/performance leftovers.
