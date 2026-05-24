You are Agent 2 / Worker for **ProcessMap**.

Contour: `feature/process-analysis-session-frontend-thin-client-switch-v1`  
Run ID: `20260520T225839Z-57944`  
Working directory: `cd /opt/processmap-test`

Task: Implement the backend session analysis view model endpoint and switch the frontend to consume it.

## Read first

1. `.planning/contours/feature/process-analysis-session-frontend-thin-client-switch-v1/PLAN.md`
2. `.planning/contours/feature/process-analysis-session-backend-view-model-contract-v1/TARGET_VIEW_MODEL_CONTRACT.md`
3. `.planning/contours/feature/process-analysis-session-backend-view-model-contract-v1/EXEC_REPORT.md`
4. Current source files (see scope below).

## Source/runtime truth (capture before coding)

Run and record in `WORKER_2_REPORT.md`:
```bash
git branch --show-current
git rev-parse HEAD
git status -sb
git diff --name-only
```

## Backend implementation

### New endpoint

Implement `GET /api/sessions/{session_id}/analysis/view-model`.

Requirements:
- Load session via `get_storage().load(session_id, org_id=..., is_admin=True)`.
- Verify access via `project_access_allowed(request, org_id, project_id)`.
- Read `interview_json → analysis.product_actions`.
- Build rows using the same normalization/completeness logic as `product_actions_registry.py`.
- Return unified envelope for `product_actions`:
  - `rows` — normalized rows scoped to this session
  - `summary` — `{ total, complete, incomplete }`
  - `filter_options` — `{ product_groups, products, action_types, stages, object_categories, roles }`
  - `applied_filters` — `{}` (defaults for GET)
  - `metrics` — `{ total_rows, complete, incomplete }`
  - `empty_state` — `{ kind, scope, message_key }`
  - `source_state` — `{ source, interview_loaded, bpmn_elements_count }`
- Return `derived.step_action_counts` — map `step_id → count` computed from rows.
- Return `interview_state` — `{ status, stage, updated_at }` from session metadata.
- Return session/project/workspace metadata.

### Where to add

Option A: Create `backend/app/routers/process_analysis_session.py` and register in `backend/app/routers/__init__.py`.
Option B: Add to existing `backend/app/routers/product_actions_registry.py` if simpler.
Pick the option that minimizes duplication with existing registry code. Reuse `_registry_row`, `_completeness`, etc.

### Backend tests

Add tests in `backend/tests/` (create `test_process_analysis_session_api.py` if needed):
- Happy path: session with product_actions returns correct envelope.
- Empty analysis: returns empty rows and correct empty_state.
- 404 for missing session.
- step_action_counts correctness.

## Frontend implementation

### API client

Add to `frontend/src/lib/api.js`:
```js
export async function apiGetSessionAnalysisViewModel(sessionId) { ... }
```
Use existing API patterns (auth headers, base URL, JSON parse, error handling).

### InterviewStage.jsx

1. Add state for `sessionAnalysisViewModel` and loading flag.
2. On mount / `sessionId` change, call `apiGetSessionAnalysisViewModel(sid)`.
3. Replace `countProductActionsForStep(data?.analysis, step)` usage with `viewModel?.analysis?.derived?.step_action_counts?.[stepId] || 0`.
4. Replace `productActionCountByStepId` memo with view-model data or keep as fallback.
5. Keep fallback: if view model is null/empty, use existing client-side computation.

### ProductActionsRegistryPanel.jsx

1. When `scope === "session"` and `sessionId` is present, call `apiGetSessionAnalysisViewModel(sessionId)`.
2. If the response is valid, use `viewModel.analysis.product_actions` fields:
   - `rows` instead of `currentRows`
   - `filter_options` instead of `uniqueProductActionRegistryFilterOptions(rows)`
   - `summary` / `metrics` instead of local `summarizeProductActionRegistryRows`
   - `empty_state` instead of ad-hoc empty state derivation
   - `source_state` instead of local heuristics
3. Keep fallback: if backend field is absent, use existing client-side logic.
4. Do NOT break workspace/project scope behavior.

### Frontend tests

Add/update tests:
- `apiGetSessionAnalysisViewModel` response parsing and error handling.
- `InterviewStage` renders step action counts from view model.
- `ProductActionsRegistryPanel` session scope renders backend rows and summary.

## Runtime verification

1. Start backend dev server (`uvicorn` or equivalent).
2. Start frontend dev server (if needed for integration).
3. `curl -I http://clearvestnic.ru:5180` — confirm HTTP 200.
4. Call the new endpoint via curl or browser DevTools and verify response shape.
5. Open a session in the UI and verify:
   - InterviewStage step action counts display correctly.
   - ProductActionsRegistryPanel session scope displays rows, summary, filters.
6. Screenshot or save console output as evidence in `WORKER_2_REPORT.md`.

## Reports

Write `WORKER_2_REPORT.md` with:
- Git proof (branch, HEAD, status, diffstat).
- Backend endpoint path and key response shape.
- Frontend files changed.
- Runtime verification evidence (curl output, screenshot paths).
- Any blockers or deviations from PLAN.md.

Create `WORKER_2_DONE` when complete.

If blocked at any stage, create `EXEC_PART_1_BLOCKED.md` with:
- Blocker description.
- Evidence (logs, git status, file paths).
- Suggested resolution.
