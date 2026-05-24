# Agent 3 / Executor Prompt — Part 2 (NO-OP)

**Contour**: `audit/to-be-technological-operations-current-stage-check-v1`  
**Run ID**: `20260520T184059Z-28875`  
**Mode**: `TOKEN_ECONOMY_SINGLE_EXECUTOR`

## Instruction

This contour runs in **TOKEN_ECONOMY_SINGLE_EXECUTOR** mode. Agent 3 MUST NOT start a separate LLM session for Part 2.

## Shell-Only Merge Tasks

1. Verify `EXECUTOR_PART_1_PROMPT.md` deliverables exist:
   - `CURRENT_STAGE_CHECKLIST.md`
   - `GAP_ANALYSIS_REPORT.md`
   - `NEXT_CONTOUR_RECOMMENDATION.md`
   - `EXEC_REPORT.md`

2. If all four files exist and are non-empty, create `EXEC_REPORT.md` merge confirmation (one line):
   ```
   # Merge Confirmation
   Agent 3 confirms Agent 2 deliverables present. Single-lane mode; no LLM execution. Ready for Agent 4 review.
   ```

3. Touch `READY_FOR_REVIEW`.

4. Hand off to Agent 4 automatically.

## Blockers

- If any deliverable is missing, set `EXEC_BLOCKED.md` with the missing file list and stop.
