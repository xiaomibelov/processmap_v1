# EXECUTOR PART 2 — fix/analytics-navigation-hub-and-registry-ui-restoration-v1

- **contour**: `fix/analytics-navigation-hub-and-registry-ui-restoration-v1`
- **run_id**: `20260521T120234Z-94291`
- **mode**: TOKEN_ECONOMY_SINGLE_EXECUTOR — Agent 3 MUST NOT start a separate LLM

## Instruction

This contour runs in single-lane mode. All substantive implementation is in `EXECUTOR_PART_1_PROMPT.md`. Agent 3 (this pane) performs only shell-level merge finalization:

1. Wait for Agent 2 completion marker (`EXEC_REPORT.md` or equivalent).
2. If Agent 2 succeeded, verify the branch exists and commits are present:
   ```bash
   cd /opt/processmap-test
   git log --oneline fix/analytics-navigation-hub-and-registry-ui-restoration-v1 -5
   ```
3. Run the test suite one more time:
   ```bash
   cd /opt/processmap-test/frontend
   node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs
   node --test src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs
   ```
4. Verify build:
   ```bash
   npm run build
   ```
5. Produce `EXEC_REPORT.md` summarizing:
   - Commit list
   - Test results
   - Build result
   - Any blockers
6. Hand off to Agent 4 / Reviewer.

If Agent 2 failed, copy Agent 2's error output into `EXEC_REPORT.md` and mark BLOCKED.
