## Agent 2 / Worker Prompt — Backend Source-Truth and Contract Design Lane

You are Agent 2 / Worker for **ProcessMap**.

Contour: `feature/process-analysis-session-backend-view-model-contract-v1`  
Run ID: `20260520T224346Z-55320`  
Task: Inspect the current backend and frontend session analysis data sources, identify divergence, and produce a grounded backend view model contract design report. **Do not implement product code.**

Read first:
- `.planning/contours/feature/process-analysis-session-backend-view-model-contract-v1/PLAN.md`
- `.planning/contours/feature/process-analysis-session-backend-view-model-contract-v1/RAG_PREFLIGHT_PLANNER.md`
- `.planning/contours/feature/process-analysis-session-backend-view-model-contract-v1/OBSIDIAN_CONTEXT_USED.md`
- `.planning/contours/feature/process-analysis-session-backend-view-model-contract-v1/GSD_CONTEXT_USED.md`

### Step 1 — Source truth capture

Capture the exact current state of session analysis data in:
1. `backend/app/storage.py` — how `interview_json` stores `analysis`, `product_actions`, `product_actions_batch_draft`; what other keys may exist in `analysis`.
2. `backend/app/routers/product_actions_ai.py` — how it reads/writes `interview.analysis` and `product_actions_batch_draft`.
3. `backend/app/routers/product_actions_registry.py` — how `list_product_actions_registry_sources()` extracts `analysis.product_actions` from `interview_json`.
4. `backend/app/routers/process_properties_registry.py` — how it extracts process properties (from `bpmn_meta_json` / `bpmn_xml`, not `interview_json`).
5. `frontend/src/components/process/InterviewStage.jsx` — how `data?.analysis` is consumed.
6. `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` — how `session?.interview?.analysis?.product_actions` is consumed.
7. `frontend/src/features/process/analysis/interviewAnalysisPatchHelper.js` — how `interview.analysis` is patched.
8. `frontend/src/components/process/interview/utils.js` — how `normalizeInterview` handles `analysis`.

For each file, record: key lines, data shapes read/written, and whether the shape is durable (DB) or derived (runtime).

### Step 2 — Divergence analysis

Produce `SESSION_ANALYSIS_VS_REGISTRY_DIVERGENCE.md` comparing:
- Interview-embedded `analysis.product_actions` vs registry `rows` shape.
- Interview-embedded analysis keys vs registry `filter_options`, `metrics`, `empty_state`.
- How frontend normalizes `product_actions` client-side vs how backend normalizes them in registry sources.
- Any field name differences (e.g., `action_object` vs `action_object_category`).
- Completeness rules: how backend `_completeness()` works vs any frontend completeness logic.

### Step 3 — Target view model contract

Produce `TARGET_VIEW_MODEL_CONTRACT.md` with:
- Proposed `ProcessAnalysisSessionViewModel` Pydantic-like schema (field names, types, optionality).
- Proposed unified envelope for session-scoped analysis (reuse registry envelope patterns where possible).
- Proposed endpoints:
  - `GET /api/sessions/{session_id}/analysis/view-model`
  - `POST /api/sessions/{session_id}/analysis/view-model/query`
- Request/response shapes for each endpoint.
- Which fields are **durable** (from DB) vs **derived** (computed at request time).
- Which fields are **shared** with registry endpoints and which are **session-specific**.

### Step 4 — Mutation endpoints gap analysis

Produce `MUTATION_ENDPOINTS_GAP_ANALYSIS.md` documenting:
- Current mutation paths for product actions (AI suggest, batch draft, manual save).
- Current mutation paths for process properties (if any).
- Which mutations write to `interview_json` vs which should be separate.
- Recommended separation: view model = read-only; mutations = dedicated endpoints.

### Outputs

Write these files to `.planning/contours/feature/process-analysis-session-backend-view-model-contract-v1/`:
1. `CURRENT_SESSION_ANALYSIS_SOURCE_TRUTH.md`
2. `SESSION_ANALYSIS_VS_REGISTRY_DIVERGENCE.md`
3. `TARGET_VIEW_MODEL_CONTRACT.md`
4. `MUTATION_ENDPOINTS_GAP_ANALYSIS.md`
5. `WORKER_2_REPORT.md` — summary with key findings and recommendations
6. `WORKER_2_DONE` — marker file

Rules:
- Do not write product code.
- Do not modify frontend/src/ or backend/app/ files.
- All contracts marked `draft` unless backed by exact source line evidence.
- Keep reports compact; use line references, not long pasted code.
