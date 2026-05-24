# Executor Part 2 Prompt: feat/active-runs-monitor-v1

## Mode

TOKEN_ECONOMY_SINGLE_EXECUTOR — This contour uses a single-lane execution model.

## Instruction

Agent 3 / Executor Part 2 MUST NOT start a separate LLM session for independent work.

After Agent 2 completes and produces `EXEC_REPORT.md` and `READY_FOR_REVIEW`, Agent 3 performs a shell-only merge:

1. Read `EXEC_REPORT.md` from Agent 2.
2. If Agent 2 report indicates success, copy it as the final `EXEC_REPORT.md` and touch `READY_FOR_REVIEW`.
3. If Agent 2 report indicates failure or blockers, write a brief `MERGE_ISSUES.md` summarizing the blocker and exit.
4. No code changes, no product edits, no new planning.

## Handoff to Agent 4

After shell merge, ensure `EXEC_REPORT.md` and `READY_FOR_REVIEW` exist in:
`.planning/contours/feat/active-runs-monitor-v1/`
