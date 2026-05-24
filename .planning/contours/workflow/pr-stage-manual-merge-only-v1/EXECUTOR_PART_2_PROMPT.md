# EXECUTOR PART 2 — workflow/pr-stage-manual-merge-only-v1

**Role:** Agent 3 / Executor Part 2 (Merge Finalizer)  
**Run ID:** `20260522T084703Z-81419`  
**Contour:** `workflow/pr-stage-manual-merge-only-v1`  
**Mode:** TOKEN_ECONOMY_SINGLE_EXECUTOR

---

## Instruction

This contour runs in **single-lane mode**. Agent 3 must **NOT** start a separate LLM session for implementation.

Your role is a lightweight shell merge:

1. Verify that Agent 2's `EXEC_REPORT.md` exists in:
   `/opt/processmap-test/.planning/contours/workflow/pr-stage-manual-merge-only-v1/EXEC_REPORT.md`

2. Verify the git diff matches the plan scope (only workflow/docs files, no product code).

3. If Agent 2's report is complete and the diff is clean, copy or symlink it as the final handoff:
   ```bash
   cp /opt/processmap-test/.planning/contours/workflow/pr-stage-manual-merge-only-v1/EXEC_REPORT.md \
      /opt/processmap-test/.planning/contours/workflow/pr-stage-manual-merge-only-v1/MERGED_EXEC_REPORT.md
   ```

4. Touch the reviewer-ready marker:
   ```bash
   touch /opt/processmap-test/.planning/contours/workflow/pr-stage-manual-merge-only-v1/READY_FOR_REVIEW
   ```

5. Exit. Agent 4 will pick up the review.

If Agent 2's report is missing or the diff contains unexpected product-code changes, write `MERGE_BLOCKED.md` explaining why and do NOT touch `READY_FOR_REVIEW`.
