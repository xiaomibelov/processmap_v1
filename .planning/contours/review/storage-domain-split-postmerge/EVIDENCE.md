# EVIDENCE — REVIEW `fix/storage-domain-split-postmerge`

**Contour:** `review/storage-domain-split-postmerge`  
**Reviewer:** agent (Agent 3, independent validation)  
**Repo:** `/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone`  
**Branch reviewed:** `fix/storage-domain-split-postmerge`  
**Base (`main`):** `ae8b78d306f80e48173cd908b354196e78fca854`  
**HEAD of reviewed branch:** `fd3f64e29527747fb8471489707544b54f6e623f`  
**Date:** 2026-08-30  

---

## 1. Git state

```bash
$ git rev-parse main
ae8b78d306f80e48173cd908b354196e78fca854

$ git rev-parse HEAD
fd3f64e29527747fb8471489707544b54f6e623f

$ git status -sb
## fix/storage-domain-split-postmerge
```

Working tree clean.

---

## 2. Circular import investigation

### 2.1 Git diff of generated files + generator

```bash
$ git diff main..fix/storage-domain-split-postmerge -- backend/app/domains/storage/ tools/split_storage_domains.py
```

Result: **empty diff for `backend/app/domains/storage/`**; only `tools/split_storage_domains.py` changed.

### 2.2 State of `compat/__init__.py` in `main` and in the reviewed branch

Both `main` and the reviewed branch contain:

```python
from __future__ import annotations

from .repository import DiagramStateConflictError, NOTE_SCOPE_TYPES, NOTE_THREAD_PRIORITIES, NOTE_THREAD_STATUSES, SESSION_PRESENCE_TTL_SECONDS, SessionNotFoundError, SessionTitleConflictError, delete_admin_entity_permission, delete_admin_entity_permission_by_role, gen_project_id, get_admin_invite_permissions, get_auth_user_by_email, get_db_runtime_info, list_admin_entity_permissions, list_auth_users, list_org_workspace_folders, list_org_workspaces, list_workspace_snapshot_rows, logger, pop_storage_request_scope, push_storage_request_scope, save_auth_users, set_admin_invite_permissions, startup_db_check, upsert_admin_entity_permission, upsert_admin_entity_permission_by_role
```

This is a full public-API re-export from `.repository`.

### 2.3 Self-import scan across all 12 domains

```bash
$ for d in compat platform dictionaries utils org_auth project explorer templates_legacy audit_telemetry ai canvas_session notes; do
>   grep -nE "from \. import|from \.\.\.\.domains\.storage\.$d" backend/app/domains/storage/$d/repository.py || echo "no self-import";
> done
```

All 12 domains report **no self-import**.

### 2.4 `compat/repository.py` top of file

No `from ....domains.storage.compat import ...` line. Definitions (`DiagramStateConflictError`, `NOTE_SCOPE_TYPES`, `SessionNotFoundError`, etc.) appear directly after the header.

### 2.5 Conclusion on circular import

The circular import described in `review/storage-domain-split-r4-postmerge/EVIDENCE.md` is **not present in the committed `main` tree** (`ae8b78d3`). The committed `compat/__init__.py` already re-exports the full public API, and `compat/repository.py` does not import from its own package. The r4 observation was likely produced by a dirty working tree where the generator had been re-run from `origin/main` after the merge, creating a broken facade-of-facade.

The fix contour prevents recurrence by pinning the generator baseline to the last monolithic commit (`7f161478`), so re-running the generator can never again read the facade as input.

---

## 3. Independent reproduction of acceptance criteria

| # | Criterion | Command | Result |
|---|-----------|---------|--------|
| 1 | Container-context import | `find backend/app -type d -name __pycache__ -exec rm -rf {} +; PYTHONPATH= .venv/bin/python -c "import backend.app.main"` | ✅ OK |
| 2 | Dev-context import | `PYTHONPATH=backend .venv/bin/python -c "import app.main"` | ✅ OK |
| 3 | Contract suite | `.venv/bin/python -m pytest backend/tests/contract/test_storage_domain_contract.py -q` | ✅ **35 passed** |
| 4 | Targeted suite | `.venv/bin/python -m pytest backend/tests/test_storage_schema_bootstrap.py backend/tests/test_admin_permissions.py backend/tests/test_org_invites.py backend/tests/test_notes_mvp1_api.py backend/tests/test_templates_rbac.py backend/tests/test_error_events_intake.py backend/tests/test_ai_execution_log_foundation.py backend/tests/test_explorer_context_folder_fields.py -q` | ✅ **50 passed** |
| 5 | Generator determinism | `PYTHONHASHSEED=0` run vs `PYTHONHASHSEED=42` run, `diff -r` | ✅ empty diff |
| 6 | Regeneration vs HEAD | `git diff -- backend/app/storage.py backend/app/domains/storage/` after regeneration | ✅ empty diff |
| 7 | Uvicorn startup | `.venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8013` | ✅ `/health` 200, `/api/health` 200 |
| 8 | Absolute-import scan | `grep -Rn '^from app\.' backend/app/storage.py backend/app/domains/storage/` | ✅ empty |

---

## 4. Baseline fixture verification

```bash
$ wc -l backend/tests/contract/fixtures/storage_top_level_names_baseline.txt
365
```

10 randomly sampled names were verified to exist in `git show 7f16147897dbc52464a0ee41391896d076f414f0:backend/app/storage.py`:

- `_admin_entity_permission_keys` ✅
- `set_feature_flag` ✅
- `_normalize_email` ✅
- `update_error_event` ✅
- `_scope_user_id` ✅
- `_DEFAULT_WORKSPACE_NAME` ✅
- `_format_deployment_notice_row` ✅
- `_invite_row_to_dict` ✅
- `upsert_process_property_metadata` ✅
- `_REQ_ORG_ID` ✅

The test no longer uses `git show origin/main:backend/app/storage.py`; it reads `backend/tests/contract/fixtures/storage_top_level_names_baseline.txt` directly.

---

## 5. Scope control

Full diff of the reviewed branch vs `main`:

```
.planning/contours/fix/storage-domain-split-postmerge/CHANGES.md
.planning/contours/fix/storage-domain-split-postmerge/EXEC_REPORT.md
.planning/contours/fix/storage-domain-split-postmerge/PLAN.md
.planning/contours/fix/storage-domain-split-postmerge/PR.md
.planning/contours/fix/storage-domain-split-postmerge/READY_FOR_REVIEW
.planning/contours/fix/storage-domain-split-postmerge/STATE.json
.planning/contours/fix/storage-domain-split-postmerge/TESTS.md
.planning/contours/fix/storage-domain-split-postmerge/mirror_local.sh
.planning/contours/review/storage-domain-split-r4-postmerge/EVIDENCE.md
.planning/contours/review/storage-domain-split-r4-postmerge/VERDICT.md
.planning/contours/review/storage-domain-split-r4-postmerge/mirror_local.sh
backend/tests/contract/fixtures/storage_top_level_names_baseline.txt
backend/tests/contract/test_storage_domain_contract.py
tools/split_storage_domains.py
```

Scope is limited to:
- contour/review artifacts,
- generator baseline pin,
- backward-compat test + fixture.

No changes to business logic, routers, services, models, or DB schema.

---

## 6. Commit under review

```text
fd3f64e2 fix(storage-domain-split): pin generator baseline + static backward-compat fixture
```

The commit message accurately describes the change. The "circular import fix" is implicit: by pinning the generator baseline, the contour guarantees that re-running the generator cannot reproduce the broken facade-of-facade state that caused the r4 circular import.

---

## 7. Stage

Not validated locally:
- `processmap_stage-api-1` is not running on this host.
- `docker-compose.stage.yml` requires `.env.stage` and `EDGE_NETWORK_NAME`; both are missing.

Stage must be validated on the stage host after merge.
