# Executor Prompt — Compatibility Summary

Contour: `architecture/process-analysis-and-registries-backend-view-model-master-plan-v1`  
Run ID: `20260520T221413Z-51872`

## Execution mode

`SINGLE_EXECUTOR_MODE` / `TOKEN_ECONOMY_SINGLE_EXECUTOR`

## Agent mapping

- **Agent 2** receives `EXECUTOR_PART_1_PROMPT.md` and performs all substantive work.
- **Agent 3** receives `EXECUTOR_PART_2_PROMPT.md` and performs shell-only merge (no LLM).

## Why single-lane

This is a planning-only, documentation-only, architecture-only contour. The scope fits one executor lane. Parallel split would waste duplicate context/RAG cost without independent benefit.

## Deliverables

Agent 2 produces:
- `WORKER_2_REPORT.md`
- `CURRENT_BACKEND_SOURCE_TRUTH.md`
- `REGISTRY_DIVERGENCE_MATRIX.md`
- `SHARED_INFRASTRUCTURE_CANDIDATES.md`
- `WORKER_2_DONE`

Agent 3 produces:
- `EXEC_REPORT.md` (merged from Agent 2 outputs)
- `EXEC_REPORT_MERGED`

Agent 4 produces:
- `REVIEW_REPORT.md`
- `REVIEW_PASS` or `CHANGES_REQUESTED`
