# Executor Part 2 Prompt (Token Economy Noop)

**Contour:** `feature/process-properties-registry-backend-contract-v1`
**Run ID:** `20260520T203825Z-44497`
**Mode:** `SINGLE_EXECUTOR_MODE`

## Instruction

This contour runs in `SINGLE_EXECUTOR_MODE`. Agent 3 must **not** start a separate LLM session for implementation.

Your job is a shell-only finalization:
1. Verify that `EXEC_PART_1_REPORT.md` from Agent 2 exists and is non-empty.
2. Verify that `git diff --stat origin/main...HEAD` shows only backend and minimal frontend files within scope:
   - `backend/app/routers/process_properties_registry.py`
   - `backend/app/storage.py`
   - `backend/tests/test_process_properties_registry_api.py`
   - `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx`
3. Run `backend/.venv/bin/python -m unittest tests.test_process_properties_registry_api` and confirm OK.
4. If all checks pass, write `WORKER_3_REPORT.md` with one-line confirmation and touch `READY_FOR_REVIEW`.
5. If any check fails, write `EXEC_BLOCKED.md` with the blocker and stop.

## Rules

- Do not start a new LLM session for implementation.
- Do not write product code.
- Do not merge, deploy, or open a PR.
- This merge is shell-only.
