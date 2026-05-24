# PLAN — feat/analytics-registries-viewmodel-ui-v1

- run_id: `20260521T223455Z-52118`
- contour: `feat/analytics-registries-viewmodel-ui-v1`
- mode: `SINGLE_EXECUTOR_MODE`
- planner: Agent 1
- created_at: `2026-05-21T22:35Z`

## 1. Source / Runtime Truth

| Fact | Value |
|------|-------|
| workspace | `/opt/processmap-test` |
| branch | `fix/analytics-runtime-navigation-registry-ui-hard-restore-v1` |
| HEAD | `7fb035397df2893818fb6e03c359c1cd319a1e00` |
| origin/main | `5affb5ff0abce2735df1c34fe369a39fe9c354e3` |
| status | dirty tracked (AGENTS.md, 2 test files); many untracked artifacts |
| stage runtime | `http://clearvestnic.ru:5180` serving main@`f01dd665` |
| frontend build | passes (npm run build, 0 errors at last check) |
| backend properties registry endpoint | exists, returns unified envelope with rows/summary/filter_options/metrics/empty_state/source_state |
| backend session analysis view-model | exists (`GET /api/sessions/{id}/analysis/view-model`), returns product_actions envelope |

**Risk**: current checkout is dirty and on a fix branch. Executor must create a clean feature branch from `origin/main` and apply only bounded changes.

## 2. Bounded Scope

Create a frontend viewmodel layer for the two analytics registry UIs, extracting all business logic (normalization, filtering, metrics, empty-state derivation) out of JSX components into pure, unit-testable functions with typed contracts.

### In scope

1. **ProcessPropertiesRegistry viewmodel**
   - New file: `frontend/src/features/process/analysis/processPropertiesRegistryViewModel.js`
   - New file: `frontend/src/features/process/analysis/processPropertiesRegistryViewModel.test.mjs`
   - Extract from `ProcessPropertiesRegistryPage.jsx`:
     - `normalizeBackendRow`
     - `buildCamundaRows`
     - `completenessOf` / `statusText`
     - filter application logic
     - metrics computation (`uniqueCount` of sources, elements, types; complete/incomplete counts)
     - `sourceTruth` message derivation
     - filter-options derivation
   - Refactor `ProcessPropertiesRegistryPage.jsx` to consume the viewmodel: thin component, only rendering and event dispatch.

2. **ProductActionsRegistry viewmodel**
   - New file: `frontend/src/features/process/analysis/productActionsRegistryViewModel.js`
   - New file: `frontend/src/features/process/analysis/productActionsRegistryViewModel.test.mjs`
   - Extract from `ProductActionsRegistryPanel.jsx`:
     - `normalizeBackendRows`
     - `normalizeBackendSessions`
     - `summarizeRowsAsSessions`
     - filter/metrics logic that is currently inline
     - viewmodel assembly from backend envelope (`apiGetSessionAnalysisViewModel` response)
   - Keep compatibility with existing `productActionsRegistryModel.js` exports where they already provide pure logic.
   - Refactor `ProductActionsRegistryPanel.jsx` to consume the new viewmodel for its core registry state.

3. **Shared contracts**
   - New file: `frontend/src/features/process/analysis/registryViewModelContracts.js`
   - JSDoc typedefs for `RegistryVM`, `RegistryMetrics`, `RegistryFilterOptions`, `RegistryEmptyState`, `RegistrySourceState`.
   - Aligned with existing backend envelope shapes and interview viewmodel contract style.

### Out of scope

- No backend endpoint changes.
- No new API routes.
- No schema or DB changes.
- No BPMN XML writes.
- No UI redesign or CSS changes.
- No changes to global shell, navigation, or routing.
- No merge/deploy/PR without explicit user approval.

## 3. Architecture Direction

Follow the established interview viewmodel pattern (`frontend/src/components/process/interview/viewmodel/`):

```
Raw API response  →  build*RegistryVM()  →  UI component renders VM
                          ↑
                    pure functions, no React hooks
                    unit-tested with .test.mjs
```

- Viewmodel functions must be **pure**: no side effects, no React hooks, deterministic for same inputs.
- Components become **thin**: only `useState` for open-row IDs and filter UI state; data computation delegated to viewmodel.
- Backend envelope fields (`filter_options`, `metrics`, `empty_state`, `source_state`) must be consumed directly when available, with client-side fallback only when backend fields are absent.

## 4. Execution Steps (single lane)

1. **Branch hygiene** — create `feat/analytics-registries-viewmodel-ui-v1` from `origin/main`.
2. **Properties Registry viewmodel**
   - Write `processPropertiesRegistryViewModel.js` with extracted pure functions.
   - Write `processPropertiesRegistryViewModel.test.mjs` covering normalization, Camunda row building, filtering, metrics, source-truth derivation.
   - Refactor `ProcessPropertiesRegistryPage.jsx` to consume the viewmodel.
   - Run tests and build; fix errors.
3. **Product Actions Registry viewmodel**
   - Write `productActionsRegistryViewModel.js` with extracted pure functions.
   - Write `productActionsRegistryViewModel.test.mjs` covering backend-row normalization, session summarization, envelope consumption.
   - Refactor `ProductActionsRegistryPanel.jsx` to consume the viewmodel.
   - Run tests and build; fix errors.
4. **Shared contracts** — write `registryViewModelContracts.js` with JSDoc typedefs.
5. **Integration verification** — ensure existing tests (`ProcessPropertiesRegistryPage.test.mjs`, `ProductActionsRegistryPage.test.mjs`) still pass after refactor.
6. **Runtime proof** — `npm run build`, verify no console errors, verify Analytics Hub → both registries still render.
7. **Git proof** — record branch, HEAD, status, diffstat.
8. **Reports** — write `EXEC_REPORT.md`, create `WORKER_2_DONE`.

## 5. Acceptance Criteria

- [ ] New branch `feat/analytics-registries-viewmodel-ui-v1` from `origin/main` with clean tree.
- [ ] `processPropertiesRegistryViewModel.js` exists and is pure (no React, no fetch).
- [ ] `productActionsRegistryViewModel.js` exists and is pure.
- [ ] `registryViewModelContracts.js` exists with JSDoc typedefs.
- [ ] `ProcessPropertiesRegistryPage.jsx` is thinner; all data logic moved to viewmodel.
- [ ] `ProductActionsRegistryPanel.jsx` uses viewmodel for core registry state.
- [ ] All new viewmodel test files pass.
- [ ] Existing registry page tests pass.
- [ ] Frontend build passes with 0 errors.
- [ ] Runtime on `:5180` (or local dev server) shows Analytics Hub, both registries open, no console errors.
- [ ] No backend/schema/BPMN/RAG changes.
- [ ] No secrets committed.

## 6. Blockers & Risks

- **BLOCKER**: Dirty current checkout. Executor must not implement on `fix/analytics-runtime-navigation-registry-ui-hard-restore-v1`. Use clean branch from `origin/main`.
- **Risk**: `ProductActionsRegistryPanel.jsx` is 1205 lines; refactor may touch many lines. Executor must keep changes minimal and focused on viewmodel extraction only.
- **Risk**: Backend envelope fields for Properties Registry may differ slightly from what the current inline logic assumes. Executor must verify shape at runtime or via source review.
- **Risk**: Existing tests may depend on internal component structure. Executor must update tests if selectors change, but only to match refactored component, not to add new test logic.

## 7. Context Sources

- RAG preflight: `RAG_PREFLIGHT_PLANNER.md` (launcher-generated, run_id verified)
- Obsidian context: `OBSIDIAN_CONTEXT_USED.md` (updated with handoff files read)
- GSD context: `GSD_CONTEXT_USED.md` (launcher-generated)
- Previous contours:
  - `feature/process-properties-registry-foundation-v1` — Properties Registry foundation
  - `feature/process-analysis-session-frontend-thin-client-switch-v1` — backend viewmodel endpoint and thin-client pattern
  - `architecture/analytics-and-diagram-overlays-server-side-view-model-v1` — server-side viewmodel architecture
  - `feature/product-actions-registry-backend-view-model-hardening-v1` — backend viewmodel hardening
