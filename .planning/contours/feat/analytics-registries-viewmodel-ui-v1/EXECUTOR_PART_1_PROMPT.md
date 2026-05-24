# EXECUTOR PART 1 PROMPT — feat/analytics-registries-viewmodel-ui-v1

- run_id: `20260521T223455Z-52118`
- contour: `feat/analytics-registries-viewmodel-ui-v1`
- role: Agent 2 / Executor (substantive implementation lane)
- receives: this prompt + PLAN.md

## Your task

Implement the frontend viewmodel layer for ProcessMap analytics registries, then refactor the UI components to consume it.

### Before writing code

1. Verify source/runtime truth:
   - `pwd`, `git remote -v`, `git fetch origin`
   - `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse origin/main`
   - `git status -sb`
2. Create a clean branch from `origin/main`:
   ```bash
   git checkout -b feat/analytics-registries-viewmodel-ui-v1 origin/main
   ```
   If current tree has uncommitted tracked changes, do NOT proceed on dirty branch. Document and stop.
3. Read the current components to understand inline logic:
   - `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx`
   - `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
4. Read existing model files:
   - `frontend/src/features/process/analysis/productActionsRegistryModel.js`
   - `frontend/src/features/process/analysis/productActionsModel.js`
5. Read the interview viewmodel pattern for reference:
   - `frontend/src/components/process/interview/viewmodel/contracts.js`
   - `frontend/src/components/process/interview/viewmodel/buildInterviewVM.js`

### Implementation order

Do these in order; do not skip tests.

#### Step A — Shared contracts

Create `frontend/src/features/process/analysis/registryViewModelContracts.js`.

Define JSDoc typedefs for:
- `RegistryRow` — common row shape (id, object, property, value, source, sourceKind, type, group, status, elementType)
- `RegistryMetrics` — totalRows, complete, incomplete, uniqueSources, uniqueElements, uniqueTypes, filteredRows
- `RegistryFilterOptions` — arrays for each filter dimension
- `RegistryEmptyState` — kind, scope, message_key
- `RegistrySourceState` — source, loaded, elementCount
- `RegistryVM` — version tag, rows[], metrics, filterOptions, appliedFilters, emptyState, sourceState, sourceTruth

#### Step B — ProcessPropertiesRegistry viewmodel

Create `frontend/src/features/process/analysis/processPropertiesRegistryViewModel.js`.

Extract and implement as pure functions:
- `normalizeBackendRow(backendRow)` → `RegistryRow`
- `buildCamundaRows(bpmnMeta, sessionTitle)` → `RegistryRow[]`
- `computeCompleteness(row)` → `{status, label}`
- `applyFilterOptions(rows)` → `RegistryFilterOptions`
- `applyFilters(rows, filters)` → `RegistryRow[]`
- `computeMetrics(allRows, filteredRows)` → `RegistryMetrics`
- `buildSourceTruth(scope, backendLoading, backendError, backendRows, clientRows)` → `string`
- `buildProcessPropertiesRegistryVM({ scope, backendRows, clientRows, bpmnMeta, sessionTitle, backendLoading, backendError, filters })` → `RegistryVM`

Create `frontend/src/features/process/analysis/processPropertiesRegistryViewModel.test.mjs`.

Test at minimum:
- normalizeBackendRow handles missing fields
- buildCamundaRows produces rows from bpmn_meta.camunda_extensions_by_element_id
- filtering works for each dimension
- metrics are correct for empty and non-empty inputs
- sourceTruth messages match conditions

Refactor `ProcessPropertiesRegistryPage.jsx`:
- Import `buildProcessPropertiesRegistryVM` and related helpers.
- Remove inline `normalizeBackendRow`, `buildCamundaRows`, `completenessOf`, `statusText`, `uniqueCount`, filter logic, metrics logic, `sourceTruth` derivation.
- Keep only React state (openRowId, filter UI state), effects (fetch backend), and JSX.
- Derive `vm` via `useMemo` calling `buildProcessPropertiesRegistryVM`.
- Render from `vm.rows`, `vm.metrics`, `vm.filterOptions`, `vm.emptyState`, `vm.sourceTruth`.

#### Step C — ProductActionsRegistry viewmodel

Create `frontend/src/features/process/analysis/productActionsRegistryViewModel.js`.

Extract and implement as pure functions:
- `normalizeBackendRows(rowsRaw)` → row shape with `registry_id`, `completeness`, `missing_fields`
- `normalizeBackendSessions(sessionsRaw)` → session summary shape
- `summarizeRowsAsSessions(rowsRaw)` → session summaries derived from rows
- `buildProductActionsRegistryVM({ backendRows, backendSessions, sessionViewModel, scope, filters })` → `RegistryVM`
  - Must consume backend envelope fields when available (`rows`, `summary`, `filter_options`, `metrics`, `empty_state`, `source_state`).
  - Must fallback to client-side computation when backend fields are absent.

Create `frontend/src/features/process/analysis/productActionsRegistryViewModel.test.mjs`.

Test at minimum:
- normalizeBackendRows handles missing registry_id
- normalizeBackendSessions maps project_title/folder_title/path correctly
- summarizeRowsAsSessions aggregates by session_id
- buildProductActionsRegistryVM consumes session view-model envelope correctly
- fallback logic works when envelope fields are missing

Refactor `ProductActionsRegistryPanel.jsx`:
- Import `buildProductActionsRegistryVM` and helpers.
- Remove inline `normalizeBackendRows`, `normalizeBackendSessions`, `summarizeRowsAsSessions` or replace with viewmodel calls.
- Keep React state for UI interactions (selected sessions, loading flags, AI suggestion state).
- Derive registry display state from viewmodel.

#### Step D — Integration & verification

- Run `npm run build` in `frontend/`. Must pass with 0 errors.
- Run existing tests: `ProcessPropertiesRegistryPage.test.mjs`, `ProductActionsRegistryPage.test.mjs`, `productActionsRegistryModel.test.mjs`. Must pass.
- Run new viewmodel tests. Must pass.
- Start local dev server if needed and verify Analytics Hub → both registries render.
- Write `EXEC_REPORT.md` with git proof, test results, and runtime verification.
- Create `WORKER_2_DONE` marker file.

### Strict rules

- No backend changes.
- No new API endpoints.
- No schema or DB changes.
- No BPMN XML writes.
- No CSS redesign.
- No changes to global shell/header/sidebar/routing.
- No merge, no PR, no deploy.
- Keep changes minimal and focused on viewmodel extraction.
- Write reports in English.
