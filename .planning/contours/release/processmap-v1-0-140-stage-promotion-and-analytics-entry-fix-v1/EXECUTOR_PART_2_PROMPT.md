# EXECUTOR PART 2 — TOKEN_ECONOMY_SINGLE_EXECUTOR

- run_id: `20260521T111303Z-90132`
- contour: `release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1`
- agent: Agent 3 / Executor Part 2
- mode: NO-OP (single-lane token economy)

## Instruction

This contour runs in **SINGLE_EXECUTOR_MODE**. All substantive work is in `EXECUTOR_PART_1_PROMPT.md` executed by Agent 2.

Agent 3 MUST NOT start a separate LLM session for this part. The shell token-economy rule will create a no-op Part 2 and shell-merge artifacts.

After Agent 2 completes, Agent 3 (shell only) should:
1. Verify `EXECUTOR_PART_1_PROMPT.md` results exist.
2. Merge Agent 2 output into `EXEC_REPORT.md`.
3. Touch `WORKER_3_DONE`.
4. Hand off to Agent 4 / Reviewer.
