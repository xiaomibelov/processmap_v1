# TESTS: fix/storage-domain-split-postmerge

## Verification matrix

| Check | Command | Expected | Actual |
|-------|---------|----------|--------|
| Container-context import | `cd <repo_root> && PYTHONPATH= .venv/bin/python -c "import backend.app.main"` | exit 0 | ✅ exit 0 |
| Dev-context import | `cd <repo_root> && PYTHONPATH=backend .venv/bin/python -c "import app.main"` | exit 0 | ✅ exit 0 |
| Contract suite | `.venv/bin/python -m pytest backend/tests/contract/test_storage_domain_contract.py -q` | 35 passed | ✅ 35 passed |
| Generator determinism | `.venv/bin/python -m pytest backend/tests/contract/test_storage_domain_contract.py::test_generator_determinism -q` | pass | ✅ pass |
| Backward-compat names | `.venv/bin/python -m pytest backend/tests/contract/test_storage_domain_contract.py::test_backward_compat_all_top_level_names -q` | pass | ✅ pass |
| Container-context smoke | `.venv/bin/python -m pytest backend/tests/contract/test_storage_domain_contract.py::test_container_context_import_smoke -q` | pass | ✅ pass |
| Targeted suite | `.venv/bin/python -m pytest backend/tests/test_storage_schema_bootstrap.py backend/tests/test_admin_permissions.py backend/tests/test_org_invites.py backend/tests/test_notes_mvp1_api.py backend/tests/test_templates_rbac.py backend/tests/test_error_events_intake.py backend/tests/test_ai_execution_log_foundation.py backend/tests/test_explorer_context_folder_fields.py -q` | 50 passed | ✅ 50 passed |
| Uvicorn startup | `.venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8012` | `/health` 200, `/api/health` 200 | ✅ both 200 |
| Absolute-import scan | `grep -Rn '^from app\.' backend/app/storage.py backend/app/domains/storage/` | empty | ✅ empty |
| Generator reproducibility | `git diff backend/app/storage.py backend/app/domains/storage/` | empty (matches correct HEAD) | ✅ empty |

## Env limitations

- Full `pytest backend/tests --timeout=120` still hangs on the host because of the pre-existing `app/metrics.py::_poll` background thread. This is unchanged from `origin/main` and is not in scope.
- `test_auto_create_subprocess_sessions.py` and `test_bpmn_meta.py` remain skipped outside Docker Compose because the Celery broker `redis://redis:6379/1` is unreachable.

## Stage runtime proof (post-merge)

Deploy workflow: `Deploy to Stage` #33303923101 for commit `39bb6f8c9f5534d9deae4711800cd0bb3d67eb5d`.
Status: **success** (`deploy` job completed in 2m53s).

| Check | URL / Command | Expected | Actual |
|-------|---------------|----------|--------|
| `/api/health` | `curl https://stage.processmap.ru/api/health` | 200 + `{"ok":true,"status":"ok",...}` | ✅ 200, API ready, Redis healthy, migrations OK |
| `/admin` | `curl https://stage.processmap.ru/admin` | 200 | ✅ 200 |
| `/admin/graphs` | `curl https://stage.processmap.ru/admin/graphs` | 200 | ✅ 200 |
| `/health` | `curl https://stage.processmap.ru/health` | 301 (redirect) | ✅ 301 |

Notes:
- `/health` returns 301 because nginx redirects the root health path; `/api/health` is the canonical API health endpoint and returns 200.
- `processmap_stage-api-1` container status was verified indirectly via the successful GitHub Actions deploy run and the responding API health endpoint. Direct `docker ps` was not available from the review host.
- No 5xx errors observed on the checked admin routes.

Stage validation is complete; prod-deploy moratorium can be lifted.
