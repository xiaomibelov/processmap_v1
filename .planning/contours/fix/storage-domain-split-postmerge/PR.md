# PR: fix/storage-domain-split-postmerge

**Title:** fix(storage-domain-split): pin generator baseline and static backward-compat fixture

**Branch:** `fix/storage-domain-split-postmerge`  
**Target:** `main`  
**Type:** bug fix / follow-up to PR #866/#867  

## What changed

1. `tools/split_storage_domains.py` now reads the original monolithic `storage.py` from commit `7f161478` instead of `origin/main`, because `origin/main` itself is the generated facade after PR #866/#867.
2. `backend/tests/contract/test_storage_domain_contract.py::test_backward_compat_all_top_level_names` now uses a checked-in fixture instead of `git show origin/main:backend/app/storage.py`.
3. Added `backend/tests/contract/fixtures/storage_top_level_names_baseline.txt` with the 365 top-level names from the last monolithic `storage.py`.

## Why

After the domain split merged to `main`, re-running the generator from `main` produced a broken facade-of-facade:
- incomplete domain `__init__.py` re-exports,
- self-referencing imports inside domain repositories,
- circular import on `import backend.app.main`.

The backward-compat test also became tautological because its baseline was the facade itself.

## Verification

- `PYTHONPATH= python -c "import backend.app.main"` ✅
- `PYTHONPATH=backend python -c "import app.main"` ✅
- Contract suite: 35 passed ✅
- Targeted suite: 50 passed ✅
- `uvicorn backend.app.main:app` starts; `/health` and `/api/health` return 200 ✅
- Generator determinism: `PYTHONHASHSEED=0/42` pass ✅
- `git diff` for generated `storage.py` + `domains/storage/` is empty ✅

## Not in this PR

- Stage redeploy (`.env.stage` / `EDGE_NETWORK_NAME` missing locally; will be validated on the stage host after merge).
- No business-logic changes.

## Deployment note

Merge only after review. Stage must be redeployed and `/health` verified before prod.
