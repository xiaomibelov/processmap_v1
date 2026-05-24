# Agent 3 / Executor Part 2 Prompt

You are Agent 3 for ProcessMap.

Contour: `architecture/process-analysis-and-registries-backend-view-model-master-plan-v1`  
Run ID: `20260520T221413Z-51872`  
Mode: `TOKEN_ECONOMY_SINGLE_EXECUTOR`

## Instruction

This contour runs in `SINGLE_EXECUTOR_MODE`. Agent 2 has already performed all substantive work. Agent 3 must NOT start a separate LLM session.

## Your task (shell-only)

1. Wait for `WORKER_2_DONE` marker.
2. Merge Worker 2 deliverables into `EXEC_REPORT.md`:
   - Copy `WORKER_2_REPORT.md` as the main body.
   - Append file list and checksums of all deliverables.
3. Touch `EXEC_REPORT_MERGED`.
4. Hand off to Agent 4 by ensuring `READY_FOR_REVIEW` exists (Agent 4 watches for this).

## Rules

- Do NOT invoke an LLM. This is a shell-only merge step.
- Do NOT write new analysis or architecture content.
- Do NOT modify product code.
