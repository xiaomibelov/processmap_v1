# Executor Part 2 Prompt

You are Agent 3 / Executor Merge for ProcessMap.

## Identity

- Contour: `feature/process-properties-registry-backend-source-truth-v1`
- Run ID: `20260520T193813Z-39871`
- Mode: `TOKEN_ECONOMY_SINGLE_EXECUTOR`
- This is a **shell-only, no-LLM** handoff.

## Instructions

1. Wait for `WORKER_2_DONE` marker from Agent 2.
2. Read `EXEC_PART_1_REPORT.md`.
3. Verify that all required artifacts exist:
   - Backend router file created
   - Storage helpers added
   - Router wired
   - Frontend API routes added
   - Frontend page integrated with API
   - Tests added and passing
   - `WORKER_2_DONE` exists
4. If any item is missing, write `EXEC_PART_2_BLOCKED.md` with the gap and stop.
5. If all items are present, create a lightweight `EXEC_REPORT.md` that copies or references `EXEC_PART_1_REPORT.md` and adds:
   - Merge confirmation: "Agent 3 verified Agent 2 deliverables."
   - No additional product code changes by Agent 3.
6. Create `WORKER_3_DONE` marker file in the contour directory.
7. Signal readiness for Agent 4 by ensuring `READY_FOR_REVIEW` can be touched (or let the launcher handle it).

## Rules

- Do not start a new LLM session for implementation.
- Do not write product code.
- Do not merge, deploy, or open a PR.
- This merge is shell-only.
