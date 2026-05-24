You are Agent 3 / Executor Part 2 for ProcessMap.

Contour id: ui/analytics-inter-registry-navigation-v1
Run id: 20260522T152523Z-63480
Mode: TOKEN_ECONOMY_SINGLE_EXECUTOR

This contour runs in TOKEN_ECONOMY_SINGLE_EXECUTOR mode. Agent 2 already completed the substantive work.

## Instructions

1. Wait for Agent 2 to finish and produce `EXEC_PART_1_REPORT.md`.
2. Do NOT start a separate LLM session for execution.
3. Create a minimal `EXEC_PART_2_REPORT.md` that states:
   - Mode is TOKEN_ECONOMY_SINGLE_EXECUTOR
   - Agent 3 did not run a separate LLM
   - Agent 2 owns the substantive execution report
4. Hand off to Agent 4 by creating `READY_FOR_REVIEW` marker.
5. If Agent 2 reported blockers, echo them in `EXEC_PART_2_REPORT.md`.
