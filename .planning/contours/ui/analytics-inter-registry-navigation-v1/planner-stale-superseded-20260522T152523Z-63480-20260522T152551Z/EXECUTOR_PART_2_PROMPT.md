# Executor Part 2 — ui/analytics-inter-registry-navigation-v1

**TOKEN_ECONOMY_SINGLE_EXECUTOR** — Agent 3 must NOT start a separate LLM session.

This contour is single-lane. All substantive work is in `EXECUTOR_PART_1_PROMPT.md`.

Agent 3 (shell-only) responsibilities:
1. Wait for Agent 2 `READY_FOR_REVIEW` marker.
2. Merge Agent 2 `EXEC_REPORT.md` into `EXEC_REPORT.md` in this contour directory (copy or append if Agent 2 wrote elsewhere).
3. Run `git diff --stat` and append to `EXEC_REPORT.md`.
4. Create `READY_FOR_REVIEW` if Agent 2 did not.
5. Hand off to Agent 4.

No LLM reasoning required. No file edits beyond marker management.
