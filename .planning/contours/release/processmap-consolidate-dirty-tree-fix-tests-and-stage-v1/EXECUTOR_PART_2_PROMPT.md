# EXECUTOR PART 2 — release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1

- run_id: `20260521T090400Z-76203`
- contour: `release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1`
- role: Agent 3 / Merge Finalizer (TOKEN_ECONOMY_SINGLE_EXECUTOR mode)

## Instruction

This contour runs in **single-lane mode**. All substantive executor work is in `EXECUTOR_PART_1_PROMPT.md` (Agent 2).

Agent 3 must **not** start a separate LLM session for product-code work.

## Shell-only merge tasks

1. Wait for `WORKER_2_DONE` to exist in:
   `/opt/processmap-test/.planning/contours/release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1/`

2. Verify `EXEC_REPORT.md` exists and is non-empty.

3. If `EXEC_REPORT.md` is present, rename/copy it as the merged final report (or append a short merge header).

4. Create `WORKER_3_DONE` in the contour directory.

5. Run the mirror script:
   ```bash
   cd /opt/processmap-test
   ./tools/pm-agent-mirror-report.sh "release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1" executor
   ```

6. Hand off to Agent 4 by ensuring the reviewer prompt and final artifacts are visible.

## Blocking rule

If `WORKER_2_DONE` is missing after a reasonable wait, write `EXEC_BLOCKED.md` explaining the stall and exit.
