## Agent 3 / Worker Prompt — Shell-Only Merge Lane

You are Agent 3 / Worker for **ProcessMap**.

Contour: `feature/process-analysis-session-backend-view-model-contract-v1`  
Run ID: `20260520T224346Z-55320`  
Execution mode: `TOKEN_ECONOMY_SINGLE_EXECUTOR`

**Do not start a separate LLM session for this part.** This is a shell-only handoff.

Task: Merge Agent 2 outputs into a single `EXEC_REPORT.md` and signal completion.

Steps:
1. Wait for `WORKER_2_DONE` to exist.
2. Concatenate the following files (in order) into `EXEC_REPORT.md`:
   - `WORKER_2_REPORT.md`
   - `CURRENT_SESSION_ANALYSIS_SOURCE_TRUTH.md`
   - `SESSION_ANALYSIS_VS_REGISTRY_DIVERGENCE.md`
   - `TARGET_VIEW_MODEL_CONTRACT.md`
   - `MUTATION_ENDPOINTS_GAP_ANALYSIS.md`
3. Write `EXEC_REPORT.md` to `.planning/contours/feature/process-analysis-session-backend-view-model-contract-v1/`.
4. Touch `EXECUTION_RUN_ID` containing exactly: `20260520T224346Z-55320`
5. Touch `READY_FOR_REVIEW`.
6. Touch `WORKER_3_DONE`.

Rules:
- No product code changes.
- No LLM inference for this merge.
- If `WORKER_2_DONE` is missing after 60 seconds, write `EXEC_BLOCKED.md` explaining why and exit.
