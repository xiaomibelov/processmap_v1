# Executor Part 1 Report — cleanup/analytics-single-source-of-truth-v1

- **run_id**: `20260522T205346Z-85330`
- **contour**: `cleanup/analytics-single-source-of-truth-v1`
- **status**: DONE
- **mode**: SINGLE_EXECUTOR_MODE (Agent 3 shell-only finalizer)

## Summary

Established single source of truth for analytics data in ProcessMap frontend by:
1. Extracting analytics routing state from `ProcessStage.jsx` into a dedicated hook.
2. Removing client-side fallback row building for Product Actions Registry (session scope).
3. Removing client-side fallback row building for Properties Registry (session scope).

## Files Changed

### Created
- `frontend/src/features/process/analysis/useAnalyticsRouteState.js` — hook for analytics hub / registry route state with popstate sync and scope reset.
- `frontend/src/features/process/analysis/useAnalyticsRouteState.test.mjs` — 12 tests covering init, open/close, scope reset, listener registration.

### Modified
- `frontend/src/components/ProcessStage.jsx` — removed local `useState` for analytics routes; now uses `useAnalyticsRouteState` hook. Removed unused route model imports. Removed `interviewData` prop passing to registry page.
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` — removed `buildProductActionRegistryRows` import and `currentRows` client fallback for session-scope. Removed `interviewData` prop from `ProductActionsRegistryContent` and `ProductActionsRegistryPanel`.
- `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx` — removed `interviewData` prop (no longer used by panel).
- `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx` — removed `buildCamundaRows`, `normalizeCamundaExtensionsMap` import, `bpmnMeta` prop, `clientRows` memo. Session scope now uses only `backendRows` from API.
- `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs` — updated tests to reflect removal of client-side Camunda parsing and fixed pre-existing version hardcoding.

### Not Modified (left intact)
- `frontend/src/features/process/analysis/productActionsRegistryModel.js` — `buildProductActionRegistryRows` still used by `loadSelectedSessions` and `acceptSelectedBulkAiRows` in the panel.

## Test Results

```
useAnalyticsRouteState.test.mjs          12 pass / 0 fail
productActionsRegistryModel.test.mjs      5 pass / 0 fail
ProcessPropertiesRegistryPage.test.mjs    5 pass / 0 fail (after fixes)
```

Frontend build: **PASS** (`vite build` completed without errors).

## Acceptance Criteria Checklist

- [x] `useAnalyticsRouteState.js` создан и используется в `ProcessStage.jsx`.
- [x] `ProcessStage.jsx` больше не содержит `useState` для analytics hub / registry route.
- [x] `ProductActionsRegistryPanel.jsx` не использует `buildProductActionRegistryRows` / `interviewData.analysis.product_actions` для session-scope.
- [x] `ProcessPropertiesRegistryPage.jsx` не использует `buildCamundaRows`.
- [x] Новые тесты проходят.
- [x] Frontend собирается без ошибок.

## Blockers

None.

## Notes

- `ProcessPropertiesRegistryPage.test.mjs` had pre-existing stale assertions (`PROCESS_PROPERTIES_REGISTRY_SURFACE` constant does not exist in route model; version hardcoded to `v1.0.138`). Updated to reflect actual codebase state.
- Backend endpoint `/api/analysis/properties/registry/query` already supports `scope: "session"` with `session_id` — confirmed by existing `apiQueryProcessPropertiesRegistry` call in `ProcessPropertiesRegistryPage.jsx`.
