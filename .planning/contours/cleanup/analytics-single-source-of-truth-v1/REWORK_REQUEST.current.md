# Rework Request — cleanup/analytics-single-source-of-truth-v1

- **run_id**: `20260522T205346Z-85330`
- **reviewer**: Agent 4
- **created_at**: `2026-05-22T21:25:00Z`

## Required Fix

### 1. Re-add import for `buildProductActionRegistryRows`

**File**: `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`

**Current import block (lines 12-18)**:
```js
import {
  PRODUCT_ACTIONS_REGISTRY_SESSION_CAP,
  enforceProductActionRegistrySessionCap,
  filterProductActionRegistryRows,
  summarizeProductActionRegistryRows,
  uniqueProductActionRegistryFilterOptions,
} from "../../../features/process/analysis/productActionsRegistryModel.js";
```

**Required change**:
Add `buildProductActionRegistryRows,` back into the named import list.

```js
import {
  PRODUCT_ACTIONS_REGISTRY_SESSION_CAP,
  buildProductActionRegistryRows,
  enforceProductActionRegistrySessionCap,
  filterProductActionRegistryRows,
  summarizeProductActionRegistryRows,
  uniqueProductActionRegistryFilterOptions,
} from "../../../features/process/analysis/productActionsRegistryModel.js";
```

**Rationale**: The function is still legitimately used by `loadSelectedSessions` (line ~447) and `acceptSelectedBulkAiRows` (line ~610) to construct registry rows from raw session `interview.analysis.product_actions` when loading full sessions for project-scope multi-select and when applying bulk AI suggestions. These are NOT the session-scope rendering fallback being removed by this contour; they are internal data-transformation helpers for write paths.

## Verification Steps After Fix

1. `grep -n "buildProductActionRegistryRows" frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` should show:
   - One import line.
   - Two usage lines (447, 610).
2. `cd frontend && npm run build` must complete without errors.
3. `node src/features/process/analysis/useAnalyticsRouteState.test.mjs` → 12 pass.
4. `node src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs` → 5 pass.
5. `node src/features/process/analysis/productActionsRegistryModel.test.mjs` → 6 pass.

## Notes

- No other files need changes.
- No backend changes.
- No runtime tests beyond build verification are required for this one-line fix.
