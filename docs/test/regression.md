# E1-E4 Regression Contour Report

- Generated: 2026-07-29T11:50:18Z (started 2026-07-29T11:41:17Z)
- Runner: `scripts/regression_e1_e4.sh`
- Branch: `feature/e1-e2-technologist-workflow`
- Local demo backend: http://localhost:18011; DB: local PostgreSQL `processmap`
- Stage: https://stage.processmap.ru — **READ-ONLY smoke only (GET requests, no auth available)**

**Result: 16 PASS / 0 FAIL / 1 WARN**

| Step | Status | Detail | Time (UTC) |
| --- | --- | --- | --- |
| alembic current/heads (alembic.ini + ALEMBIC_URL override) | PASS | DB at single head: current=005 | 11:41:18Z |
| seeds idempotency (seed_operations + seed_dictionaries x2) | PASS | runs 1+2 OK, catalog count=13 both times | 11:41:20Z |
| backend tests (pytest backend/tests/ -q) | PASS | E1-E4 contour tests green; 207 failed, 686 passed, 369 warnings, 1 error, 13 subtests passed in 511.86s (0:08:31) | 11:49:53Z |
| backend tests: PRE-EXISTING failures unrelated to E1-E4 (not fixed) | WARN | 220 failing tests / collection errors by file: backend/tests/test_bpmn_meta.py(39); backend/tests/test_auto_create_subprocess_sessions.py(18); backend/tests/test_bpmn_subprocess_clipboard.py(17); backend/tests/test_path_report_api.py(14); backend/tests/test_status_service.py(11); backend/tests/test_notes_extraction_preview_endpoint.py(11); backend/tests/test_bpmn_task_clipboard.py(11); backend/tests/test_session_cache.py(9); backend/tests/test_diagram_cas_guard.py(9); backend/tests/test_redis_cache_workspace_tldr.py(6); backend/tests/test_publish_git_mirror_execution.py(6); backend/tests/test_bpmn_save_rbac_scope.py(6); backend/tests/test_path_report_runtime_logging.py(5); backend/tests/test_e2e_interview_diagram_xml.py(4); backend/tests/test_diagram_revision_parity.py(4); backend/tests/test_workspace_access_controls.py(3); backend/tests/test_session_presence_api.py(3); backend/tests/test_session_meta_endpoint.py(3); backend/tests/test_project_sessions_summary.py(3); backend/tests/test_org_property_dictionary_api.py(3); backend/tests/test_enterprise_reports_scope_delete.py(3); backend/tests/test_sessions_drift.py(2); backend/tests/test_extension_state_save_flow.py(2); backend/tests/test_enterprise_workspace_endpoint.py(2); backend/tests/test_bpmn_restore_endpoint.py(2); backend/tests/test_backend_domain_anomaly_telemetry.py(2); backend/tests/test_analytics_aggregator.py(2); backend/tests/test_subprocess_navigation.py(1); backend/tests/test_storage_sqlite_scope.py(1); backend/tests/test_sessions_rbac.py(1); backend/tests/t — full log: /tmp/regression_e1_e4_pytest.log | 11:49:53Z |
| frontend vitest (src/features/technologist) | PASS |  Test Files  5 passed (5)       Tests  27 passed (27)  | 11:49:57Z |
| frontend node --test (src/lib/apiRoutes.test.mjs) | PASS | # pass 6 # fail 0  | 11:49:57Z |
| vite build (frontend) | PASS | ✓ built in 18.22s | 11:50:17Z |
| smoke local: GET /api/health | PASS | status ok | 11:50:17Z |
| smoke local: GET /api/health/process-template | PASS | db connected, tables exist | 11:50:17Z |
| smoke local: login admin@local | PASS | token acquired | 11:50:17Z |
| smoke local: POST /api/process-templates/import-bpmn (tobe_razogrev_supa_rtk_v03) | PASS | errors=0 nodes=35 flows=36 warnings=37 | 11:50:17Z |
| smoke local: GET /api/operation-catalog | PASS | 13 operations | 11:50:17Z |
| smoke local: GET /api/dictionaries/* (4 dicts) | PASS |  equipment-types=10; container-types=4; zone-types=4; sku=3; | 11:50:17Z |
| STAGE(read-only): GET /api/health/process-template | PASS | HTTP 200 | 11:50:17Z |
| STAGE(read-only): GET /technologist/constructor | PASS | HTTP 200 | 11:50:17Z |
| STAGE(read-only): GET /technologist/import-bpmn | PASS | HTTP 200 | 11:50:18Z |
| STAGE(read-only): GET /api/operation-catalog w/o token | PASS | HTTP 401 (auth guard works) | 11:50:18Z |

## Stage smoke section

Steps prefixed `STAGE(read-only)` are executed against https://stage.processmap.ru with plain
unauthenticated GET requests only. No writes, no auth tokens, no mutations.
`/api/operation-catalog` returning 401 without a token is the expected
behaviour and confirms the auth guard works.

## Notes

- `backend/alembic.local.ini` does not exist; alembic runs with
  `backend/alembic.ini` where `sqlalchemy.url` is overridden via `ALEMBIC_URL`
  (default: local DB) rendered into a temp ini.
- PRE-EXISTING backend-test failures (if any) are listed in the backend-tests
  step row and were not introduced by / fixed within the E1-E4 contours.
- Backend tests run with `--continue-on-collection-errors` so one broken
  module cannot abort the whole suite; such errors are classified PRE-EXISTING.
- Full pytest log of the last run: `/tmp/regression_e1_e4_pytest.log`.
