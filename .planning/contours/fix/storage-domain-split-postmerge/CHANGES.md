# CHANGES: fix/storage-domain-split-postmerge

## Summary

Minimal, non-functional fix that makes the storage-domain split reproducible and testable after `origin/main` became the generated facade.

## Files changed

| File | Change | Reason |
|------|--------|--------|
| `tools/split_storage_domains.py` | Pin baseline to monolithic commit `7f161478` | `origin/main` now contains the facade, so reading from it produced a broken facade-of-facade |
| `backend/tests/contract/test_storage_domain_contract.py` | `test_backward_compat_all_top_level_names` uses static fixture | Post-merge comparison against `origin/main` compared the facade with itself |
| `backend/tests/contract/fixtures/storage_top_level_names_baseline.txt` | New: 365 top-level names from `7f161478:backend/app/storage.py` | Immutable baseline for backward-compat contract |

## Regenerated files (no diff vs. correct HEAD)

Running the updated generator reproduces the already-merged `backend/app/storage.py` facade and `backend/app/domains/storage/` domain modules exactly. `git diff` for these files is empty, confirming the generator now emits the correct code.

## What was broken

- Re-running `tools/split_storage_domains.py` from `main` read `origin/main:backend/app/storage.py` (the facade) and emitted:
  - incomplete domain `__init__.py` files (only `logger` in `compat/__init__.py`),
  - self-referencing imports in domain `repository.py` files,
  - missing public re-exports.
- This caused `ImportError: cannot import name 'DiagramStateConflictError' from partially initialized module ...` on a fresh import.
- The backward-compat test also failed post-merge because its baseline was the facade itself.

## What is fixed

- Generator always reads the last monolithic `storage.py` (`7f161478`).
- All domain `__init__.py` files re-export their public API from `repository.py`.
- No domain `repository.py` imports from its own package.
- Backward-compat test uses a static, version-controlled fixture.
