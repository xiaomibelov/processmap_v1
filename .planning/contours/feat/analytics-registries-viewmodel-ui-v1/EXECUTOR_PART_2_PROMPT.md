# EXECUTOR PART 2 PROMPT — feat/analytics-registries-viewmodel-ui-v1

- run_id: `20260521T223455Z-52118`
- contour: `feat/analytics-registries-viewmodel-ui-v1`
- role: Agent 3 / Merge finalizer (shell-only, no LLM)
- mode: `TOKEN_ECONOMY_SINGLE_EXECUTOR`

## Instruction

This contour runs in **single-lane mode**. Agent 3 does not start a separate LLM session for implementation.

Your job is a shell-only merge of Agent 2 results into final executor artifacts:

1. Verify `WORKER_2_DONE` exists.
2. Read `EXEC_REPORT.md` from Agent 2.
3. Produce merged `EXEC_REPORT.md` if needed (or copy Agent 2 report if complete).
4. Create `READY_FOR_REVIEW` marker.
5. Hand off to Agent 4.

If `WORKER_2_DONE` is missing or `EXEC_REPORT.md` indicates `BLOCKED`, create `EXEC_BLOCKED.md` with summary and stop.

Do not write product code. Do not run tests. Do not start a dev server.
