# PLAN: fix/storage-domain-split-postmerge

**Contour:** `fix/storage-domain-split-postmerge`  
**Type:** `fix`  
**Branch:** `fix/storage-domain-split-postmerge`  
**Base:** `main` `ae8b78d306f80e48173cd908b354196e78fca854` (merge of PR #867)  

---

## Goal

Restore the ability to start the application from a clean `main` checkout and make the storage-domain split reproducible after `origin/main` itself became the facade.

This is a **minimal follow-up fix** to the merged `fix/storage-domain-split` contour:
- Pin the generator baseline to the last monolithic `storage.py` commit.
- Replace the dynamic post-merge baseline in the backward-compat contract test with a static fixture.
- Verify the generated code still imports correctly in both container and dev contexts.

No business-logic changes.

---

## Scope (bounded)

- `tools/split_storage_domains.py` — baseline reference only.
- `backend/tests/contract/test_storage_domain_contract.py` — use static baseline fixture.
- `backend/tests/contract/fixtures/storage_top_level_names_baseline.txt` — new fixture (365 names).
- Regenerated `backend/app/storage.py` + `backend/app/domains/storage/` (idempotent, no diff vs. correct HEAD).

Out of scope:
- Stage redeploy (`.env.stage` and `EDGE_NETWORK_NAME` are not present on this host; documented separately).
- New feature work.
- Changes to domain decomposition or cross-domain transaction design.

---

## Root cause

After PR #866/#867 merged to `origin/main`, `origin/main:backend/app/storage.py` is no longer the original monolith — it is the generated facade. The generator was reading from `origin/main`, so re-running it produced a broken facade-of-facade with:
- empty/incomplete domain `__init__.py` files,
- self-referencing imports inside `compat/repository.py`,
- missing public re-exports.

The backward-compat test also read from `origin/main`, so post-merge it compared the facade against itself and expected 365 names.

---

## Changes

1. `tools/split_storage_domains.py`:
   - `read_storage_source()` now reads the original monolith from commit `7f16147897dbc52464a0ee41391896d076f414f0` (last monolithic `storage.py` before PR #866).

2. `backend/tests/contract/test_storage_domain_contract.py`:
   - `test_backward_compat_all_top_level_names` reads names from the checked-in fixture instead of `git show origin/main:backend/app/storage.py`.

3. `backend/tests/contract/fixtures/storage_top_level_names_baseline.txt`:
   - Static list of 365 top-level names extracted from `7f161478:backend/app/storage.py`.

---

## Acceptance criteria

- [x] `PYTHONPATH= python -c "import backend.app.main"` from repo root exits 0.
- [x] `PYTHONPATH=backend python -c "import app.main"` exits 0.
- [x] Contract suite: 35 passed, 0 failed.
- [x] Targeted suite (8 files, 50 tests): 50 passed.
- [x] Generator determinism test passes (`PYTHONHASHSEED=0/42`).
- [x] `uvicorn backend.app.main:app` starts and `/health` + `/api/health` return 200.
- [x] No absolute `from app.*` imports in `storage.py` / `domains/storage/`.
- [x] `git diff` for generated `storage.py` and `domains/storage/` is empty (generator reproduces correct HEAD).

---

## Risks

- The static baseline fixture must not drift. Future public-surface changes require an explicit contour and fixture update.
- Stage verification could not be performed locally because `.env.stage` and `EDGE_NETWORK_NAME` are missing; must be validated on the stage host after merge.

---

## Deliverables

- `PLAN.md`, `CHANGES.md`, `TESTS.md`, `PR.md`, `EXEC_REPORT.md`, `STATE.json`.
- `READY_FOR_REVIEW` flag.
- Mirror to Obsidian via `mirror_local.sh`.
