# Executor Prompt — Part 1

**Contour:** `feature/product-actions-registry-backend-contract-fields-v1`  
**Run ID:** `20260520T191945Z-37206`  
**Mode:** `SINGLE_EXECUTOR_MODE`

## Your Task

You are the sole executor for this backend-only API contract hardening contour.

### 1. Isolate Changes

The working tree on branch `fix/lockfile-sync-test` contains uncommitted backend changes that implement the contract fields. You must isolate them cleanly:

- Create and checkout a fresh branch from `origin/main`:
  ```
  git fetch origin
  git checkout -b feature/product-actions-registry-backend-contract-fields-v1 origin/main
  ```
- Copy into this branch **only** the intended backend changes:
  - `backend/app/routers/product_actions_registry.py`
  - `backend/tests/test_product_actions_registry_api.py`
- **Do not** copy any frontend changes, CSS changes, or other unrelated files.

### 2. Verify Tests Pass

Run the backend test suite:
```
cd backend
.venv/bin/python -m unittest tests.test_product_actions_registry_api -v
```
All 12 tests must pass. If any fail, fix the root cause.

### 3. Verify Contract Fields

Using a quick Python script or shell invocation, call `_registry_payload` (or the endpoint via test harness) and assert that the response contains:
- `filter_options` with the 7 expected families
- `applied_filters` mirroring request filters
- `metrics` with totals, filtered, page, complete/incomplete breakdowns
- `empty_state` with `kind`, `scope`, `message_key`
- `source_state` with `source`, `namespace`, `heavy_payload_excluded`, `mutation_allowed`, scan counters

### 4. Verify No-Mutation Boundary

Confirm by code inspection that the query and export functions do **not** call `storage.save()`, mutate `session.interview`, or modify `diagram_state_version`.

### 5. Commit

Commit with a conventional message:
```
feat(backend): harden product actions registry contract fields

Adds filter_options, applied_filters, metrics, empty_state, source_state
to the registry query response. Expands test coverage for contract
fields, empty states, and query/export parity.
```

### 6. Report

Write `EXEC_REPORT.md` to the contour directory with:
- Branch name and HEAD commit
- Diff stat (`git diff --stat origin/main...HEAD`)
- Test result summary
- Any deviations or fix-ups applied

## Constraints
- Do not modify frontend code.
- Do not add new endpoints.
- Do not rename existing response keys.
- Do not introduce storage mutations.
- Keep changes minimal and additive.
