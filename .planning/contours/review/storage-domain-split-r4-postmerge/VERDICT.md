# VERDICT — REVIEW `fix/storage-domain-split` post-merge (r4)

**Contour:** `review/storage-domain-split-r4-postmerge`  
**Commit under review:** `ae8b78d306f80e48173cd908b354196e78fca854` (`main`, merge of PR #867)  
**Verdict:** `CHANGES_REQUESTED`  

---

## Executive summary

The merge of `fix/storage-domain-split` into `main` introduces a **critical import regression**: `backend.app.main` cannot be imported on a clean checkout because of a circular import inside `backend/app/domains/storage/compat/`. This blocks the application from starting in both container (`PYTHONPATH=`) and normal (`PYTHONPATH=backend`) contexts. In addition, the post-merge contract test `test_backward_compat_all_top_level_names` is no longer meaningful because it compares the current facade against `origin/main`, which is now the facade itself.

`main` is therefore **not safe to deploy** without a follow-up fix.

---

## Checklist results

| # | Criterion | Result | Notes |
|---|---|---|---|
| 1 | Stage `processmap_stage-api-1` healthy, `/healthz` 200 | **NOT CHECKED** | Stage container does not exist on this host. Local dev container root returns 200, `/healthz` returns 404. |
| 2 | No absolute `from app.*` imports in `storage.py` / `domains/storage/` | **PASS** | `grep` returns empty. |
| 3 | Generator deterministic (`PYTHONHASHSEED=0/42`) | **PASS** | `test_generator_determinism` passes. |
| 4 | Container-context smoke exists and passes | **FAIL** | Fails with circular import in `domains/storage/compat/`. |
| 5 | Merge commit `71bb146f` resolution spot-check | **PARTIAL** | Relative imports are correct, but `compat/__init__.py` and `compat/repository.py` contain circular/self-referencing imports. |
| 6 | Contract suite (35) + targeted (50) green on `main` | **FAIL** | 2 contract tests fail; targeted suite file not present. |

---

## Blockers requiring a fix contour

### B1. Circular import prevents application startup

**Evidence:** `EVIDENCE.md` section 5.

**Technical cause:**
- `backend/app/domains/storage/compat/__init__.py` exports only `logger`.
- `backend/app/domains/storage/compat/repository.py` defines `DiagramStateConflictError`, `SessionNotFoundError`, `SessionTitleConflictError`, constants, and public helper functions, but also imports those same names from `....domains.storage.compat` (line 31) and imports itself as `_compat_repo` (line 52).
- When `storage.py` imports public names from `.domains.storage.compat`, Python starts loading `compat/__init__`, which loads `compat/repository`, which tries to read names from the partially initialized `compat` package → `ImportError`.

**Required fix:**
1. Remove the self-referencing import in `compat/repository.py` line 31. Names defined in `repository.py` should be used directly inside the same module.
2. Remove the self-referencing `_compat_repo` import in `compat/repository.py` line 52 and the recursive delegations in `_projectstorage___init__` / `_storage___post_init__`.
3. Restore `compat/__init__.py` to re-export all public names defined in `compat/repository.py`, matching the contract expected by `storage.py` and other domain repositories.

### B2. `test_backward_compat_all_top_level_names` uses a post-merge baseline

**Evidence:** `EVIDENCE.md` section 6.

**Required fix:** Update the test to compare against the pre-merge baseline (e.g. the commit immediately before PR #866 / #867) or against a static manifest of the 365 required names. The current comparison against `origin/main:backend/app/storage.py` is tautological post-merge.

### B3. Missing / non-located targeted suite

The review checklist references a "targeted suite (50 tests)", but `backend/tests/targeted/test_storage_domain_targeted.py` does not exist on `main`. Clarify the intended path or create the suite.

### B4. Stage environment unavailable

`processmap_stage-api-1` is not running, so the primary runtime proof (checklist item 1) could not be collected. After the fix contour, stage must be redeployed and verified before `main` is considered safe.

---

## Non-blockers / observations

- Absolute imports were successfully eliminated by PR #867.
- Generator determinism still holds.
- The facade in `storage.py` remains thin and free of business logic.

---

## Recommendation

Start a new `fix/storage-domain-split-postmerge` contour (or continue `fix/storage-domain-split` if preferred) with the sole goal of making `import backend.app.main` and `import app.main` succeed on a clean `main` checkout, while keeping all existing passing contract tests green. Do **not** merge or deploy `main` until this fix is reviewed and merged.
