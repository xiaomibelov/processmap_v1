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

## Stage verification

Could not be performed locally:
- `processmap_stage-api-1` container is not present on this host.
- `docker-compose.stage.yml` requires `.env.stage` and `EDGE_NETWORK_NAME`; both are missing.
- Stage must be validated on the stage host after merge.
