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
    path = "/api/control/boom"
    query = ""


class _DummyRequest:
    method = "GET"
    url = _DummyUrl()
    headers = {"x-client-request-id": "req_http_control"}
    scope = {"route": SimpleNamespace(path="/api/control/boom")}
    state = SimpleNamespace(auth_user={"id": "user_http"}, active_org_id="org_http")


class BackgroundExceptionTelemetryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "background_exception_telemetry.sqlite3")
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

    def _async_rows(self):
        from app.storage import list_error_events

        return list_error_events(event_type="backend_async_exception", limit=20, order="asc")

    def test_controlled_background_exception_emits_durable_row_without_request_id(self):
        from app.error_events.background import capture_backend_async_exception

        try:
            raise ValueError("forbidden-secret")
        except Exception as exc:
            row = capture_backend_async_exception(
                exc,
                task_name="controlled_background_task",
                execution_scope="background",
                context_json={
                    "safe": "ok",
                    "authorization": "Bearer forbidden-secret",
                    "request_body": {"token": "forbidden-secret"},
                },
            )

        self.assertIsInstance(row, dict)
        rows = self._async_rows()
        self.assertEqual(len(rows), 1)
        stored = rows[0]
        self.assertEqual(stored.get("event_type"), "backend_async_exception")
        self.assertEqual(stored.get("source"), "backend")
        self.assertEqual(stored.get("severity"), "error")
        self.assertFalse(stored.get("request_id"))
        context = stored.get("context_json") or {}
        self.assertEqual(context.get("execution_scope"), "background")
        self.assertEqual(context.get("task_name"), "controlled_background_task")
        self.assertEqual(context.get("exception_type"), "ValueError")
        self.assertEqual(context.get("authorization"), "[REDACTED]")
        self.assertEqual((context.get("request_body") or {}).get("_redacted"), "payload")
        self.assertNotIn("forbidden-secret", json.dumps(stored, ensure_ascii=False))

    def test_auto_pass_worker_exception_emits_with_explicit_correlation_metadata(self):
        from app.auto_pass_jobs import _capture_worker_processor_exception

        try:
            raise LookupError("worker exploded")
        except Exception as exc:
            row = _capture_worker_processor_exception(
                exc,
                {
                    "job_id": "job_auto_pass_1",
                    "run_id": "run_auto_pass_1",
                    "request_id": "req_origin_1",
                    "user_id": "user_worker",
                    "org_id": "org_worker",
                    "session_id": "sess_worker",
                    "mode": "all",
                    "max_variants": 10,
                    "max_steps": 100,
                    "max_visits_per_node": 2,
                },
            )

        self.assertIsInstance(row, dict)
        rows = self._async_rows()
        self.assertEqual(len(rows), 1)
        stored = rows[0]
        self.assertEqual(stored.get("request_id"), "req_origin_1")
        self.assertEqual(stored.get("correlation_id"), "run_auto_pass_1")
        self.assertEqual(stored.get("user_id"), "user_worker")
        self.assertEqual(stored.get("org_id"), "org_worker")
        self.assertEqual(stored.get("session_id"), "sess_worker")
        context = stored.get("context_json") or {}
        self.assertEqual(context.get("execution_scope"), "worker")
        self.assertEqual(context.get("task_name"), "auto_pass_worker")
        self.assertEqual(context.get("job_id"), "job_auto_pass_1")
        self.assertEqual(context.get("run_id"), "run_auto_pass_1")

    def test_expected_handled_worker_outcome_does_not_emit_exception_noise(self):
        from app.auto_pass_jobs import _capture_worker_processor_exception

        out = _capture_worker_processor_exception(
            RuntimeError("AUTO_PASS_NO_SUCCESSFUL_VARIANTS"),
            {
                "job_id": "job_expected",
                "run_id": "run_expected",
                "request_id": "req_expected",
                "session_id": "sess_expected",
            },
        )

        self.assertIsNone(out)
        self.assertEqual(self._async_rows(), [])

    def test_path_report_thread_wrapper_captures_unhandled_non_request_exception(self):
        import app._legacy_main as legacy

        original = legacy._run_path_report_generation_async

        def _boom(**_kwargs):
            raise RuntimeError("path report forbidden-secret")

        legacy._run_path_report_generation_async = _boom
        try:
            with self.assertRaises(RuntimeError):
                legacy._run_path_report_generation_with_capture(
                    session_id="sess_report",
                    path_id="path_1",
                    report_id="rpt_1",
                    request_payload_json={"token": "forbidden-secret"},
                    prompt_template_version="v2",
                    model_name="deepseek-chat",
                    org_id="org_report",
                    request_id="req_report_origin",
                )
        finally:
            legacy._run_path_report_generation_async = original

        rows = self._async_rows()
        self.assertEqual(len(rows), 1)
        stored = rows[0]
        self.assertEqual(stored.get("request_id"), "req_report_origin")
        self.assertEqual(stored.get("correlation_id"), "rpt_1")
        self.assertEqual(stored.get("org_id"), "org_report")
        self.assertEqual(stored.get("session_id"), "sess_report")
        context = stored.get("context_json") or {}
        self.assertEqual(context.get("execution_scope"), "background")
        self.assertEqual(context.get("task_name"), "path_report_generation")
        self.assertEqual(context.get("path_id"), "path_1")
        self.assertEqual(context.get("report_id"), "rpt_1")
        self.assertNotIn("forbidden-secret", json.dumps(stored, ensure_ascii=False))

    def test_request_path_backend_exception_taxonomy_is_unchanged(self):
        from app.error_events import build_backend_exception_event

        try:
            raise RuntimeError("request boom")
        except Exception as exc:
            stored = build_backend_exception_event(_DummyRequest(), exc)

        self.assertEqual(stored.event_type, "backend_exception")
        self.assertEqual(stored.source, "backend")
        self.assertEqual(stored.request_id, "req_http_control")
        self.assertEqual((stored.context_json.get("_server") or {}).get("capture"), "backend_exception_middleware")
        self.assertNotEqual(stored.event_type, "backend_async_exception")


if __name__ == "__main__":
    unittest.main()
