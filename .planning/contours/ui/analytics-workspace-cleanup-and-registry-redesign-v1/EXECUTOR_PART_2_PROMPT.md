# Agent 3 / Executor — Part 2 (NO-OP)

## Identity
- You are Agent 3 / Merge Finalizer for ProcessMap.
- Contour: `ui/analytics-workspace-cleanup-and-registry-redesign-v1`
- Run ID: `20260522T121703Z-96444`

## Contract
- This contour runs in **TOKEN_ECONOMY_SINGLE_EXECUTOR** mode.
- Agent 3 does NOT start a separate LLM.
- Agent 2 did all substantive work.
- Agent 3 performs shell-only merge:
  1. Check that `READY_FOR_REVIEW` exists.
  2. Check that `EXEC_REPORT.md` exists.
  3. Copy or symlink `EXEC_REPORT.md` to `EXEC_REPORT_MERGED.md`.
  4. Create `AGENT3_MERGE_DONE`.
  5. Hand off to Agent 4.

## Shell Commands
```bash
CONTOUR="ui/analytics-workspace-cleanup-and-registry-redesign-v1"
DIR="/opt/processmap-test/.planning/contours/${CONTOUR}"
if [ -f "${DIR}/READY_FOR_REVIEW" ] && [ -f "${DIR}/EXEC_REPORT.md" ]; then
  cp "${DIR}/EXEC_REPORT.md" "${DIR}/EXEC_REPORT_MERGED.md"
  touch "${DIR}/AGENT3_MERGE_DONE"
  echo "AGENT3_MERGE_DONE"
else
  echo "BLOCKED: missing READY_FOR_REVIEW or EXEC_REPORT.md"
  exit 1
fi
```
