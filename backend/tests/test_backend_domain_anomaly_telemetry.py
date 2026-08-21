import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class _DummyUrl:
    path = "/api/control/domain-boom"
    query = ""


class _DummyRequest:
    method = "GET"
    url = _DummyUrl()
    headers = {"x-client-request-id": "req_domain_guard"}
    scope = {"route": SimpleNamespace(path="/api/control/domain-boom")}
    state = SimpleNamespace(auth_user={"id": "user_domain_guard"}, active_org_id="org_domain_guard")


class BackendDomainAnomalyTelemetryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "backend_domain_anomaly.sqlite3")
        self.old_process_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_database_url = os.environ.get("DATABASE_URL")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        os.environ["PROCESS_DB_PATH"] = self.db_path
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)

        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

    def tearDown(self):
        if self.old_process_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_process_db_path
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_project_storage_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_project_storage_dir
        if self.old_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self.old_database_url
        if self.old_backend is None:
            os.environ.pop("FPC_DB_BACKEND", None)
        else:
            os.environ["FPC_DB_BACKEND"] = self.old_backend
        self.tmp.cleanup()

    def _domain_rows(self):
        from app.storage import list_error_events

        return list_error_events(event_type="domain_invariant_violation", limit=20, order="asc")

    def _failed_result(self):
        return {
            "schema_version": "auto_pass_v1.1",
            "status": "failed",
            "error_code": "NO_COMPLETE_PATH_TO_END",
            "error_message": "forbidden-secret",
            "graph_hash": "graph_hash_123",
            "run_id": "run_auto_pass_1",
            "limits": {
                "mode": "all",
                "max_variants": 10,
                "max_steps": 100,
                "max_visits_per_node": 2,
            },
            "summary": {
                "total_variants": 0,
                "total_variants_done": 0,
                "total_variants_failed": 3,
                "failed_reasons": {"NO_COMPLETE_PATH_TO_END": 3},
                "truncated": False,
            },
            "warnings": [
                {"code": "NO_COMPLETE_PATH_TO_END", "message": "No complete path reaches EndEvent"},
            ],
        }

    def test_controlled_auto_pass_final_semantic_anomaly_emits_durable_row(self):
        from app.routers.auto_pass import _emit_auto_pass_domain_anomaly

        row = _emit_auto_pass_domain_anomaly(
            self._failed_result(),
            {
                "job_id": "job_auto_pass_1",
                "run_id": "run_auto_pass_1",
                "session_id": "sess_auto_pass",
                "org_id": "org_auto_pass",
                "user_id": "user_auto_pass",
                "project_id": "proj_auto_pass",
            },
        )

        self.assertIsInstance(row, dict)
        rows = self._domain_rows()
        self.assertEqual(len(rows), 1)
        stored = rows[0]
        self.assertEqual(stored.get("event_type"), "domain_invariant_violation")
        self.assertEqual(stored.get("source"), "backend")
        self.assertEqual(stored.get("severity"), "error")
        self.assertFalse(stored.get("request_id"))
        self.assertEqual(stored.get("correlation_id"), "run_auto_pass_1")
        self.assertEqual(stored.get("session_id"), "sess_auto_pass")
        self.assertEqual(stored.get("project_id"), "proj_auto_pass")
        self.assertEqual(stored.get("route"), "/api/sessions/sess_auto_pass/auto-pass")
        context = stored.get("context_json") or {}
        self.assertEqual(context.get("domain"), "auto_pass")
        self.assertEqual(context.get("operation"), "auto_pass_run")
        self.assertEqual(context.get("invariant_name"), "no_complete_path_to_end")
        self.assertEqual(context.get("error_code"), "NO_COMPLETE_PATH_TO_END")
        self.assertEqual((context.get("summary") or {}).get("total_variants_done"), 0)
        self.assertNotIn("forbidden-secret", json.dumps(stored, ensure_ascii=False))

    def test_auto_pass_anomaly_with_request_and_identity_correlation_fields(self):
        from app.routers.auto_pass import _emit_auto_pass_domain_anomaly

        result = self._failed_result()
        result["run_id"] = "run_auto_pass_2"
        _emit_auto_pass_domain_anomaly(
            result,
            {
                "job_id": "job_auto_pass_2",
                "run_id": "run_auto_pass_2",
                "request_id": "req_auto_pass_origin",
                "session_id": "sess_corr",
                "org_id": "org_corr",
                "user_id": "user_corr",
                "project_id": "proj_corr",
            },
        )

        rows = self._domain_rows()
        self.assertEqual(len(rows), 1)
        stored = rows[0]
        self.assertEqual(stored.get("request_id"), "req_auto_pass_origin")
        self.assertEqual(stored.get("correlation_id"), "run_auto_pass_2")
        self.assertEqual(stored.get("user_id"), "user_corr")
        self.assertEqual(stored.get("org_id"), "org_corr")
        self.assertEqual(stored.get("session_id"), "sess_corr")
        self.assertEqual(stored.get("project_id"), "proj_corr")
        context = stored.get("context_json") or {}
        self.assertEqual(context.get("job_id"), "job_auto_pass_2")
        self.assertEqual(context.get("run_id"), "run_auto_pass_2")
        self.assertEqual((context.get("_server") or {}).get("capture"), "backend_domain_invariant")

    def test_healthy_auto_pass_done_result_does_not_emit_anomaly_noise(self):
        from app.routers.auto_pass import _emit_auto_pass_domain_anomaly

        out = _emit_auto_pass_domain_anomaly(
            {
                "schema_version": "auto_pass_v1.1",
                "status": "done",
                "run_id": "run_done",
                "summary": {"total_variants_done": 1},
            },
            {
                "job_id": "job_done",
                "run_id": "run_done",
                "request_id": "req_done",
                "session_id": "sess_done",
            },
        )

        self.assertIsNone(out)
        self.assertEqual(self._domain_rows(), [])

    def test_persisted_auto_pass_failed_state_from_session_patch_emits_once(self):
        from app._legacy_main import UpdateSessionIn, get_storage, patch_session
        from app.storage import get_default_org_id

        st = get_storage()
        org_id = get_default_org_id()
        sid = st.create(
            title="auto pass persisted failure",
            project_id="proj_persisted_auto_pass",
            user_id="user_persisted_auto_pass",
            org_id=org_id,
        )
        result = self._failed_result()
        result["run_id"] = "run_persisted_auto_pass"
        result["error_message"] = "secret persisted message"

        patched = patch_session(
            sid,
            UpdateSessionIn(bpmn_meta={"auto_pass_v1": result}),
            request=None,
        )

        self.assertEqual((patched.get("bpmn_meta") or {}).get("auto_pass_v1", {}).get("status"), "failed")
        rows = self._domain_rows()
        self.assertEqual(len(rows), 1)
        stored = rows[0]
        self.assertEqual(stored.get("event_type"), "domain_invariant_violation")
        self.assertEqual(stored.get("correlation_id"), "run_persisted_auto_pass")
        self.assertEqual(stored.get("session_id"), sid)
        self.assertEqual(stored.get("project_id"), "proj_persisted_auto_pass")
        self.assertEqual(stored.get("user_id"), "user_persisted_auto_pass")
        self.assertEqual(stored.get("org_id"), org_id)
        self.assertEqual(stored.get("route"), f"/api/sessions/{sid}")
        context = stored.get("context_json") or {}
        self.assertEqual(context.get("domain"), "auto_pass")
        self.assertEqual(context.get("operation"), "auto_pass_persisted_state")
        self.assertEqual(context.get("run_id"), "run_persisted_auto_pass")
        self.assertEqual(context.get("error_code"), "NO_COMPLETE_PATH_TO_END")
        self.assertNotIn("secret persisted message", json.dumps(stored, ensure_ascii=False))

        patch_session(
            sid,
            UpdateSessionIn(bpmn_meta={"auto_pass_v1": result}),
            request=None,
        )
        self.assertEqual(len(self._domain_rows()), 1)

    def test_persisted_auto_pass_done_state_does_not_emit_anomaly_noise(self):
        from app._legacy_main import UpdateSessionIn, get_storage, patch_session

        st = get_storage()
        sid = st.create(title="auto pass persisted success", project_id="proj_done_auto_pass")
        patch_session(
            sid,
            UpdateSessionIn(
                bpmn_meta={
                    "auto_pass_v1": {
                        "schema_version": "auto_pass_v1.1",
                        "status": "done",
                        "run_id": "run_persisted_done",
                        "summary": {"total_variants": 1, "total_variants_done": 1, "total_variants_failed": 0},
                        "variants": [
                            {
                                "variant_id": "V001",
                                "status": "done",
                                "end_reached": True,
                                "end_event_id": "End_1",
                                "task_steps": [],
                                "gateway_choices": [],
                            }
                        ],
                    }
                }
            ),
            request=None,
        )

        self.assertEqual(self._domain_rows(), [])

    def test_request_path_backend_exception_taxonomy_is_not_changed(self):
        from app.error_events import build_backend_exception_event

        try:
            raise RuntimeError("request boom")
        except Exception as exc:
            stored = build_backend_exception_event(_DummyRequest(), exc)

        self.assertEqual(stored.event_type, "backend_exception")
        self.assertEqual(stored.source, "backend")
        self.assertEqual(stored.request_id, "req_domain_guard")
        self.assertNotEqual(stored.event_type, "domain_invariant_violation")


if __name__ == "__main__":
    unittest.main()
