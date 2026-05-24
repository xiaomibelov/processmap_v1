# REWORK REQUEST — feat/analytics-registries-viewmodel-ui-v1

- run_id: `20260521T223455Z-52118`
- contour: `feat/analytics-registries-viewmodel-ui-v1`
- role: Agent 4 / Reviewer
- verdict: CHANGES_REQUESTED

## Required Changes

### 1. Commit working tree

**Problem:** The working tree contains uncommitted changes.

**Evidence:**
```
 M frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx
 M frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs
 M frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs
 M frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx
?? frontend/src/features/process/analysis/registryViewModelContracts.js
?? frontend/src/features/process/analysis/processPropertiesRegistryViewModel.js
?? frontend/src/features/process/analysis/processPropertiesRegistryViewModel.test.mjs
?? frontend/src/features/process/analysis/productActionsRegistryViewModel.js
?? frontend/src/features/process/analysis/productActionsRegistryViewModel.test.mjs
```

**Fix:** Stage and commit all changes on branch `feat/analytics-registries-viewmodel-ui-v1`.

### 2. Remove inline metrics recomputation from ProcessPropertiesRegistryPage.jsx

**Problem:** Lines 136–137 recompute `totalComplete` and `totalIncomplete` inline instead of consuming the values already provided by the viewmodel.

**Current code (lines 136–137):**
```jsx
const totalComplete = vm.allRows.filter((row) => computeCompleteness(row).status === "complete").length;
const totalIncomplete = vm.allRows.length - totalComplete;
```

**Fix:** Replace with `vm.metrics.complete` and `vm.metrics.incomplete`:
```jsx
const totalComplete = vm.metrics.complete;
const totalIncomplete = vm.metrics.incomplete;
```

Also verify that `computeCompleteness` and `statusText` imports can be removed from `ProcessPropertiesRegistryPage.jsx` if they are no longer used elsewhere in the component. (`computeCompleteness` is used by `StatusBadge` at line 14, so that import must remain. `statusText` import appears unused and can be removed.)

## Verification after rework

- [ ] `git status` shows clean tree (no uncommitted tracked changes, no intended untracked files).
- [ ] `npm run build` in `frontend/` passes with 0 errors.
- [ ] `node --test` for all 5 test suites passes.
- [ ] No new console errors or warnings.
