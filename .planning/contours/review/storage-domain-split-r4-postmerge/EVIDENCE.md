# EVIDENCE — REVIEW `fix/storage-domain-split` post-merge (r4)

**Contour:** `review/storage-domain-split-r4-postmerge`  
**Reviewer:** agent (post-merge validation per `AGENTS.md` r4 checklist)  
**Repo:** `/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone`  
**Commit under review:** `ae8b78d306f80e48173cd908b354196e78fca854` (`main`, merge of PR #867)  
**Date:** 2026-08-30  

---

## 1. Git state

```bash
$ git rev-parse HEAD
ae8b78d306f80e48173cd908b354196e78fca854

$ git status -sb
## main...origin/main
```

Working tree clean, branch `main` aligned with `origin/main`.

---

## 2. Stage / runtime healthcheck

### Expected stage container
```bash
$ docker ps --filter name=processmap_stage-api -a --format 'table {{.Names}}\t{{.Status}}'
NAMES     STATUS
```

**Finding:** `processmap_stage-api-1` does not exist on this host. Stage healthcheck from the r4 checklist **cannot be performed**.

### Local dev stack (running, but not the target environment)
```bash
$ docker exec processmap_v1-api-1 python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/').getcode())"
200

$ docker exec processmap_v1-api-1 python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/healthz').getcode())"
urllib.error.HTTPError: HTTP Error 404: Not Found
```

`/` returns 200, `/healthz` returns 404. The container image is older than the reviewed `main`; no `git` inside the container to confirm the exact commit.

---

## 3. Absolute-import scan

```bash
$ grep -Rn '^from app\.' backend/app/storage.py backend/app/domains/storage/
(no output)
```

**Result:** no absolute `from app.*` imports inside `storage.py` or the `domains/storage/` tree.

---

## 4. Generator determinism

```bash
$ .venv/bin/python -m pytest backend/tests/contract/test_storage_domain_contract.py::test_generator_determinism -q --tb=short
.                                                                        [100%]
1 passed in 0.54s
```

**Result:** PASS.

**Note:** `tools/split_storage_domains.py` now reads `origin/main:backend/app/storage.py`, which is itself the post-merge facade. The determinism test still passes, but it validates reproducibility of the facade split, not of the original monolith.

---

## 5. Container-context import smoke (r4 checklist item 4)

### Test run on clean `main`
```bash
$ .venv/bin/python -m pytest backend/tests/contract/test_storage_domain_contract.py::test_container_context_import_smoke -q --tb=short
F                                                                        [100%]
=================================== FAILURES ===================================
_____________________ test_container_context_import_smoke ______________________
backend/tests/contract/test_storage_domain_contract.py:228: in test_container_context_import_smoke
    assert result.returncode == 0, (
E   AssertionError: Container-context import failed:
E     stdout=
E     stderr=Traceback (most recent call last):
E       File "<string>", line 1, in <module>
E       File "/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone/backend/app/main.py", line 3, in <module>
E         from .startup.app_factory import create_app
E       File "/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone/backend/app/startup/app_factory.py", line 5, in <module>
E         from .. import _legacy_main
E       File "/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone/backend/app/_legacy_main.py", line 36, in <module>
E         from .analytics_read_model import refresh_analytics_for_session
E       File "/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone/backend/app/analytics_read_model.py", line 9, in <module>
E         from .storage import _connect, _ensure_schema, get_project_storage, get_storage
E       File "/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone/backend/app/storage.py", line 31, in <module>
E         from .domains.storage.compat import DiagramStateConflictError, ...
E       File "/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone/backend/app/domains/storage/__init__.py", line 3, in <module>
E         from . import compat
E       File "/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone/backend/app/domains/storage/compat/__init__.py", line 3, in <module>
E         from .repository import logger
E       File "/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone/backend/app/domains/storage/compat/repository.py", line 31, in <module>
E         from ....domains.storage.compat import DiagramStateConflictError, NOTE_SCOPE_TYPES, NOTE_THREAD_PRIORITIES, NOTE_THREAD_STATUSES, SESSION_PRESENCE_TTL_SECONDS, SessionNotFoundError, SessionTitleConflictError, delete_admin_entity_permission, delete_admin_entity_permission_by_role, gen_project_id, get_admin_invite_permissions, get_auth_user_by_email, get_db_runtime_info, list_admin_entity_permissions, list_auth_users, list_org_workspace_folders, list_org_workspaces, list_workspace_snapshot_rows, logger, pop_storage_request_scope, push_storage_request_scope, save_auth_users, set_admin_invite_permissions, startup_db_check, upsert_admin_entity_permission, upsert_admin_entity_permission_by_role
E     ImportError: cannot import name 'DiagramStateConflictError' from partially initialized module 'backend.app.domains.storage.compat' (most likely due to a circular import)
```

### Manual reproduction outside pytest
```bash
$ find backend/app -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null
$ PYTHONPATH= .venv/bin/python -c "import backend.app.main"
ImportError: cannot import name 'DiagramStateConflictError' from partially initialized module 'backend.app.domains.storage.compat'

$ PYTHONPATH=backend .venv/bin/python -c "import app.main"
ImportError: cannot import name 'DiagramStateConflictError' from partially initialized module 'app.domains.storage.compat'
```

**Result:** FAIL in both container context (`PYTHONPATH=`) and normal context (`PYTHONPATH=backend`). `app.main` cannot be imported on a clean checkout of `main`.

### Root cause (spot-check)

`backend/app/domains/storage/compat/__init__.py` currently exports only `logger`:

```python
from .repository import logger
```

`storage.py` imports many public names from `.domains.storage.compat` (e.g. `DiagramStateConflictError`, `SessionNotFoundError`, `SessionTitleConflictError`, etc.). Those names are defined in `compat/repository.py`, but `repository.py` line 31 also imports them from `....domains.storage.compat`, creating a circular import. When `compat/__init__.py` is partially initialized, `repository.py` tries to read those names from it and fails.

This is a regression introduced after the merge of PR #866 / #867: the facade split left `compat/__init__.py` incomplete and kept a self-referencing import in `compat/repository.py`.

### Mutation check (absolute-import regression)

A manual mutation `from .db import ...` → `from app.db import ...` in `storage.py` still reproduces the expected `ModuleNotFoundError: No module named 'app'`. The absolute-import guard works, but it is masked by the circular-import failure above.

---

## 6. Backward-compatibility names scan (r4 checklist item 6)

```bash
$ .venv/bin/python -m pytest backend/tests/contract/test_storage_domain_contract.py::test_backward_compat_all_top_level_names -q --tb=short
F                                                                        [100%]
=================================== FAILURES ===================================
___________________ test_backward_compat_all_top_level_names ___________________
backend/tests/contract/test_storage_domain_contract.py:257: in test_backward_compat_all_top_level_names
    assert len(names) == 365, f"expected 365 top-level names, found {len(names)}"
E   AssertionError: expected 365 top-level names, found 6
E   assert 6 == 365
E    +  where 6 == len(['logger', '_attach_compat_methods', 'Storage', 'ProjectStorage', 'get_project_storage', 'get_storage'])
```

**Result:** FAIL.

**Analysis:** The test compares the current `app.storage` against `origin/main:backend/app/storage.py`. After the merge, `origin/main` itself is the facade, so the test now compares the facade against itself and expects 365 names. The test is no longer valid as a post-merge acceptance criterion. It must be updated to use the pre-merge baseline (e.g. `origin/main~1` or the commit immediately before PR #866) or replaced with a static manifest of required names.

---

## 7. Contract suite summary on clean `main`

```bash
$ .venv/bin/python -m pytest backend/tests/contract/test_storage_domain_contract.py -q --tb=short
.................................FF                                      [100%]
FAILED test_container_context_import_smoke
FAILED test_backward_compat_all_top_level_names
2 failed, 33 passed in 406.87s
```

- `test_generator_determinism`: PASS
- 32 other contract tests: PASS
- `test_container_context_import_smoke`: FAIL (circular import)
- `test_backward_compat_all_top_level_names`: FAIL (post-merge baseline mismatch)

---

## 8. Targeted suite

No dedicated `backend/tests/targeted/test_storage_domain_targeted.py` file exists on `main`. The referenced "targeted suite (50 tests)" from previous review rounds is not present in this checkout.

---

## 9. Spot-check of merge resolution (PR #867, commit `ae8b78d3`)

### `backend/app/storage.py`
- Uses relative imports: `from .db`, `from .models`, `from .domains.storage.*`.
- Facade code ≤ 100 lines; no business logic beyond delegation.

### `backend/app/domains/storage/compat/repository.py`
- Contains real definitions for `DiagramStateConflictError`, `SessionNotFoundError`, `SessionTitleConflictError`, constants, and functions.
- Line 31 contains a self-referencing import from `....domains.storage.compat`.
- Line 52 contains `from ....domains.storage.compat import repository as _compat_repo`, another self-reference.
- These self-references create the circular import and recursive delegation bugs.

### `backend/app/domains/storage/compat/__init__.py`
- Only exports `logger`.
- Does not re-export the public names that `storage.py` and other domain repositories import from `compat`.

---

## 10. Additional observations

- The running local container (`processmap_v1-api-1`) responds 200 on `/`, suggesting an older image. A fresh build from `main` would likely fail to start because `backend.app.main` cannot be imported.
- Absolute imports are gone, satisfying the import-scan criterion, but the circular import makes the container-context fix ineffective in practice.
