# EXEC_REPORT: fix/storage-domain-split-postmerge

## What was done

1. Created branch `fix/storage-domain-split-postmerge` from `main` `ae8b78d3`.
2. Pinned `tools/split_storage_domains.py` baseline to the last monolithic `storage.py` commit (`7f161478`).
3. Added static fixture `backend/tests/contract/fixtures/storage_top_level_names_baseline.txt` (365 names).
4. Updated `test_backward_compat_all_top_level_names` to read from the fixture.
5. Regenerated `backend/app/storage.py` + `backend/app/domains/storage/`; output matches correct HEAD with empty `git diff`.
6. Verified imports, contract suite, targeted suite, uvicorn startup, and generator determinism.

## Git proof

```text
branch: fix/storage-domain-split-postmerge
checkout: /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone
base: ae8b78d306f80e48173cd908b354196e78fca854 (main, PR #867 merge)
origin/main: dc030f1c118cb5dc487d85ef47d0d7608c5fa7cd
HEAD: ae8b78d306f80e48173cd908b354196e78fca854
status: clean (only contour/test/generator changes)
```

## Changed/created files

- `tools/split_storage_domains.py`
- `backend/tests/contract/test_storage_domain_contract.py`
- `backend/tests/contract/fixtures/storage_top_level_names_baseline.txt`
- `.planning/contours/fix/storage-domain-split-postmerge/` artifacts

## Test results

| Suite | Result |
|-------|--------|
| Container-context import (`PYTHONPATH=`) | ✅ OK |
| Dev-context import (`PYTHONPATH=backend`) | ✅ OK |
| Contract tests | ✅ 35 passed |
| Targeted suite (8 files) | ✅ 50 passed |
| Generator determinism | ✅ pass |
| Uvicorn `/health` + `/api/health` | ✅ 200 |
| Absolute-import scan | ✅ empty |
| Generated-files diff | ✅ empty |

## Stage status

- `processmap_stage-api-1` not present on this host.
- `docker-compose.stage.yml` requires `.env.stage` and `EDGE_NETWORK_NAME`; neither is present locally.
- Stage validation deferred to the stage host after merge.

## Risks

- Static fixture must be updated deliberately if the public surface of `app.storage` ever changes.
- Stage must be redeployed and verified before prod.

## Status

Ready for review.
