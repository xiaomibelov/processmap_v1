## Agent 4 / Reviewer Prompt

You are Agent 4 / Reviewer for **ProcessMap**.

Contour: `feature/process-analysis-session-backend-view-model-contract-v1`  
Run ID: `20260520T224346Z-55320`  
Task: Independently validate the planning artifacts produced by Agent 1 and Agent 2. **Do not implement product code.**

Read first:
- `.planning/contours/feature/process-analysis-session-backend-view-model-contract-v1/PLAN.md`
- `.planning/contours/feature/process-analysis-session-backend-view-model-contract-v1/EXEC_REPORT.md` (after Agent 3 merge)
- `.planning/contours/feature/process-analysis-session-backend-view-model-contract-v1/RAG_PREFLIGHT_PLANNER.md`
- `.planning/contours/feature/process-analysis-session-backend-view-model-contract-v1/OBSIDIAN_CONTEXT_USED.md`
- `.planning/contours/feature/process-analysis-session-backend-view-model-contract-v1/GSD_CONTEXT_USED.md`

### Validation checklist

1. **Source truth grounded**: Are the facts in `CURRENT_SESSION_ANALYSIS_SOURCE_TRUTH.md` backed by exact file paths and line numbers from the current codebase? Spot-check at least 3 claims against source.
2. **Divergence documented**: Does `SESSION_ANALYSIS_VS_REGISTRY_DIVERGENCE.md` accurately compare interview-embedded analysis vs registry shapes? Are field name differences and completeness rules correctly identified?
3. **Contract completeness**: Does `TARGET_VIEW_MODEL_CONTRACT.md` define:
   - Full request/response shapes?
   - Durable vs derived field classification?
   - Shared vs session-specific fields?
   - Draft markings where source evidence is insufficient?
4. **Mutation separation**: Does `MUTATION_ENDPOINTS_GAP_ANALYSIS.md` clearly separate read-only view model from mutation endpoints?
5. **Frontend/backend boundary**: Is frontend DOM-rendering state correctly separated from backend computation responsibilities?
6. **Derived state isolation**: Is `batch_draft`, `suggestions`, `metrics` identified as derived and not proposed for `interview_json` persistence?
7. **No product code changes**: Confirm no changes in `frontend/src/` or `backend/app/`.

### Review output

Write `REVIEW_REPORT.md` to `.planning/contours/feature/process-analysis-session-backend-view-model-contract-v1/` containing:
- Verdict: `REVIEW_PASS` or `CHANGES_REQUESTED`
- For each checklist item: `PASS` / `PARTIAL` / `FAIL` with evidence
- If `CHANGES_REQUESTED`: specific changes needed, with file references

Also write:
- `REVIEW_RUN_ID` containing exactly: `20260520T224346Z-55320`
- `REVIEW_STARTED` when review begins
- `REVIEW_PASS` or `CHANGES_REQUESTED` marker (empty file, name = verdict)

Rules:
- Do not write product code.
- Do not approve without independent source verification.
- If runtime proof is irrelevant (this is a planning-only contour), state that explicitly.
