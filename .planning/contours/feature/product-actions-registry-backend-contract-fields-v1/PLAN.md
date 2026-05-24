# PLAN — feature/product-actions-registry-backend-contract-fields-v1

**Run ID:** `20260520T191945Z-37206`  
**Role:** Agent 1 / Planner  
**Mode:** `SINGLE_EXECUTOR_MODE` (backend-only, API-contract-only contour)

## 1. Source Truth

- Canonical remote: `git@github.com:xiaomibelov/processmap_v1.git`
- Baseline: `origin/main` (`d805e1c64c1107b9e3fe6854e031694bf741b187`)
- Current branch: `fix/lockfile-sync-test` (HEAD `5b20bc2d1292f419647238eaf37dac55f9315942`)
- Target namespace: `POST /api/analysis/product-actions/registry/query`, `POST /api/analysis/product-actions/registry/export.csv`, `POST /api/analysis/product-actions/registry/export.xlsx`
- `/api/analytics/*` is **out of scope** (future migration target only).

## 2. Goal

Harden the Product Actions Registry backend API contract by ensuring five additive response fields are fully present, tested, backward-compatible, and committed on a clean branch.

The fields:
- `filter_options`
- `applied_filters`
- `metrics`
- `empty_state`
- `source_state`

## 3. Scope

### In Scope (backend only)
1. `backend/app/routers/product_actions_registry.py` — ensure `_registry_payload` returns all five additive fields with correct shapes.
2. `backend/tests/test_product_actions_registry_api.py` — ensure tests cover:
   - presence and shape of each additive field;
   - filter/pagination consistency;
   - empty-state kinds (`no_sessions`, `no_actions`, `no_filtered_rows`, `not_empty`);
   - query/export parity (export returns same filtered row set as query);
   - no-mutation boundary (query does not mutate session storage).
3. Clean branch creation from `origin/main` and isolated commit of backend changes.

### Out of Scope
- Frontend files (`frontend/src/...`, CSS, JSX).
- New endpoints or URL renames.
- DB schema migrations.
- AI/RAG runtime changes.
- Analytics hub or properties registry.

## 4. Backward Compatibility Rules

- Existing response keys (`ok`, `scope`, `rows`, `summary`, `sessions`, `session_summary`, `page`) must not change shape or disappear.
- New fields are additive only.
- Request contract remains unchanged.

## 5. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | `filter_options` returns families `product_groups`, `products`, `action_types`, `stages`, `object_categories`, `roles`, `completeness` with unique sorted non-empty values | Test assertion |
| 2 | `applied_filters` reflects normalized request filters; lists deduplicated; completeness normalized to `all/complete/incomplete`; invalid completeness = `422` | Test assertion |
| 3 | `metrics` distinguishes `total_rows`, `filtered_rows`, `page_rows`, `complete`, `incomplete`, `total_complete`, `total_incomplete`, `sessions_with_actions`, `sessions_without_actions`, pagination values | Test assertion |
| 4 | `empty_state` has `kind`, `scope`, `message_key`; correctly discriminates empty scenarios | Test assertion |
| 5 | `source_state` has `source`, `namespace`, `heavy_payload_excluded=true`, `mutation_allowed=false`, scan counters | Test assertion |
| 6 | Query and export endpoints return identical filtered row ordering and content | Test assertion + manual diff |
| 7 | Query/export path performs zero writes to session storage | Code inspection + before/after test |
| 8 | All backend tests pass (`python -m unittest tests.test_product_actions_registry_api`) | CI/local run |
| 9 | Commit is on a clean feature branch from `origin/main` with only backend files in diff | `git diff --name-only origin/main...HEAD` |

## 6. Blockers & Risks

- **Risk:** Working tree contains mixed frontend changes from unrelated contours. Executor must isolate only backend files.
- **Mitigation:** Create fresh branch `feature/product-actions-registry-backend-contract-fields-v1` from `origin/main`; stage only `backend/app/routers/product_actions_registry.py` and `backend/tests/test_product_actions_registry_api.py`.

## 7. Execution Flow

1. **Agent 2 (Executor Part 1)** — isolate backend changes, run tests, commit.
2. **Agent 3 (Merge Finalizer)** — shell-only merge; verify diff stat; write `EXEC_REPORT.md`.
3. **Agent 4 (Reviewer)** — API contract, test coverage, no-mutation boundary review.
