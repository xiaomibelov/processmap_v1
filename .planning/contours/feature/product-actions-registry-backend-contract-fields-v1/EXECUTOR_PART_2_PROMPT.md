# Executor Prompt — Part 2 (Token Economy Noop)

**Contour:** `feature/product-actions-registry-backend-contract-fields-v1`  
**Run ID:** `20260520T191945Z-37206`  
**Mode:** `SINGLE_EXECUTOR_MODE`

## Instruction

This contour runs in `SINGLE_EXECUTOR_MODE`. Agent 3 must **not** start a separate LLM session for implementation.

Your job is a shell-only finalization:
1. Verify that `EXEC_REPORT.md` from Agent 2 exists and is non-empty.
2. Verify that `git diff --stat origin/main...HEAD` shows only:
   - `backend/app/routers/product_actions_registry.py`
   - `backend/tests/test_product_actions_registry_api.py`
3. Run `backend/.venv/bin/python -m unittest tests.test_product_actions_registry_api` and confirm OK.
4. If all checks pass, write `WORKER_3_REPORT.md` with one-line confirmation and touch `READY_FOR_REVIEW`.
5. If any check fails, write `EXEC_BLOCKED.md` with the blocker and stop.
