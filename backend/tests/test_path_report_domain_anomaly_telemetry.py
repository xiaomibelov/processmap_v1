import json
import os
import sys
import tempfile
import time
import types
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _make_payload(session_id: str, path_id: str) -> dict:
    return {
        "session_id": session_id,
        "path_id": path_id,
        "path_name": f"Path {path_id}",
        "generated_at": "2026-04-17T00:00:00.000Z",
        "totals": {"steps_count": 1, "work_total_sec": 60, "wait_total_sec": 0, "total_sec": 60},
        "steps": [{"order_index": 1, "title": "Step A"}],
    }


class PathReportDomainAnomalyTelemetryTest(unittest.TestCase):
    def setUp(self):
        if "yaml" not in sys.modules:
            mod = types.ModuleType("yaml")
            mod.safe_dump = lambda *args, **kwargs: ""
            mod.safe_load = lambda *args, **kwargs: {}
            sys.modules["yaml"] = mod

        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "path_report_domain_anomaly.sqlite3")
        self.sessions_dir = str(Path(self.tmp.name) / "sessions")
        self.projects_dir = str(Path(self.tmp.name) / "projects")
        self.old_process_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_database_url = os.environ.get("DATABASE_URL")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_path_report_sync_mode = os.environ.get("PATH_REPORT_SYNC_MODE")
        os.environ["PROCESS_DB_PATH"] = self.db_path
        os.environ["PROCESS_STORAGE_DIR"] = self.sessions_dir
        os.environ["PROJECT_STORAGE_DIR"] = self.projects_dir
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ["PATH_REPORT_SYNC_MODE"] = "1"
        os.environ.pop("DATABASE_URL", None)

        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

        from app._legacy_main import (
            CreatePathReportVersionIn,
            CreateSessionIn,
            create_path_report_version,
            create_session,
            get_report_version,
        )

        self.CreatePathReportVersionIn = CreatePathReportVersionIn
        self.CreateSessionIn = CreateSessionIn
        self.create_path_report_version = create_path_report_version
        self.create_session = create_session
        self.get_report_version = get_report_version

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
        if self.old_path_report_sync_mode is None:
            os.environ.pop("PATH_REPORT_SYNC_MODE", None)
        else:
            os.environ["PATH_REPORT_SYNC_MODE"] = self.old_path_report_sync_mode
        self.tmp.cleanup()

    def _domain_rows(self):
        from app.storage import list_error_events

        return list_error_events(event_type="domain_invariant_violation", limit=20, order="asc")

    def _async_rows(self):
        from app.storage import list_error_events

        return list_error_events(event_type="backend_async_exception", limit=20, order="asc")

    def _wait_report_ready(self, report_id: str, timeout_sec: float = 3.0) -> dict:
        deadline = time.time() + max(0.1, float(timeout_sec or 0))
        snapshot = {}
        while time.time() < deadline:
            snapshot = self.get_report_version(report_id)
            if str((snapshot or {}).get("status") or "").strip().lower() in {"ok", "error"}:
                return snapshot
            time.sleep(0.02)
        return self.get_report_version(report_id)

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch("app.ai.deepseek_questions.generate_path_report", side_effect=RuntimeError("provider forbidden-secret"))
    def test_controlled_final_path_report_failure_emits_durable_domain_row(self, _mock_report, _mock_llm):
        created = self.create_session(self.CreateSessionIn(title="Path report telemetry"))
        sid = str(created["id"])
        req = self.CreatePathReportVersionIn(
            steps_hash="steps_hash_failure",
            request_payload_json=_make_payload(sid, "primary"),
            prompt_template_version="v2",
        )

        out = self.create_path_report_version(sid, "primary", req)
        report = out.get("report") or {}
        detail = self._wait_report_ready(str(report.get("id")))

        self.assertEqual(detail.get("status"), "error")
        rows = self._domain_rows()
        self.assertEqual(len(rows), 1)
        stored = rows[0]
        self.assertEqual(stored.get("event_type"), "domain_invariant_violation")
        self.assertEqual(stored.get("source"), "backend")
        self.assertEqual(stored.get("severity"), "error")
        self.assertEqual(stored.get("session_id"), sid)
        self.assertEqual(stored.get("route"), f"/api/sessions/{sid}/paths/primary/reports")
        self.assertEqual(stored.get("correlation_id"), str(report.get("id")))
        self.assertFalse(stored.get("request_id"))
        context = stored.get("context_json") or {}
        self.assertEqual(context.get("domain"), "path_report")
        self.assertEqual(context.get("operation"), "path_report_generation")
        self.assertEqual(context.get("invariant_name"), "provider_failed")
        self.assertEqual(context.get("error_code"), "provider_failed")
        self.assertEqual(context.get("report_id"), str(report.get("id")))
        self.assertEqual(context.get("report_version_id"), str(report.get("id")))
        self.assertEqual(context.get("path_id"), "primary")
        self.assertEqual(context.get("steps_hash"), "steps_hash_failure")
        self.assertEqual(context.get("status"), "error")
        self.assertEqual(context.get("error_class"), "RuntimeError")
        self.assertNotIn("forbidden-secret", json.dumps(stored, ensure_ascii=False))

    def test_path_report_anomaly_with_explicit_correlation_metadata(self):
        from app._legacy_main import _emit_path_report_domain_anomaly

        _emit_path_report_domain_anomaly(
            {
                "id": "rpt_corr",
                "session_id": "sess_corr",
                "path_id": "path_corr",
                "version": 2,
                "steps_hash": "steps_hash_corr",
                "status": "error",
                "model": "deepseek-chat",
                "prompt_template_version": "v2",
                "warnings_json": [{"code": "payload_compacted_retry"}, {"code": "provider_failed"}],
            },
            session_id="sess_corr",
            path_id="path_corr",
            org_id="org_corr",
            user_id="user_corr",
            project_id="proj_corr",
            request_id="req_report_origin",
            route="/api/sessions/sess_corr/paths/path_corr/reports",
            error_code="provider_failed_after_compact_retry",
            error_class="RuntimeError",
        )

        rows = self._domain_rows()
        self.assertEqual(len(rows), 1)
        stored = rows[0]
        self.assertEqual(stored.get("request_id"), "req_report_origin")
        self.assertEqual(stored.get("correlation_id"), "rpt_corr")
        self.assertEqual(stored.get("user_id"), "user_corr")
        self.assertEqual(stored.get("org_id"), "org_corr")
        self.assertEqual(stored.get("session_id"), "sess_corr")
        self.assertEqual(stored.get("project_id"), "proj_corr")
        self.assertEqual(stored.get("route"), "/api/sessions/sess_corr/paths/path_corr/reports")
        context = stored.get("context_json") or {}
        self.assertEqual(context.get("report_id"), "rpt_corr")
        self.assertEqual(context.get("report_version_id"), "rpt_corr")
        self.assertEqual(context.get("path_id"), "path_corr")
        self.assertEqual(context.get("error_code"), "provider_failed_after_compact_retry")
        self.assertEqual(context.get("warning_codes"), ["payload_compacted_retry", "provider_failed"])
        self.assertEqual((context.get("_server") or {}).get("capture"), "backend_domain_invariant")

    def test_healthy_path_report_success_row_does_not_emit_anomaly_noise(self):
        from app._legacy_main import _emit_path_report_domain_anomaly

        out = _emit_path_report_domain_anomaly(
            {
                "id": "rpt_ok",
                "session_id": "sess_ok",
                "path_id": "path_ok",
                "version": 1,
                "steps_hash": "steps_hash_ok",
                "status": "ok",
            },
            session_id="sess_ok",
            path_id="path_ok",
            request_id="req_ok",
        )

        self.assertIsNone(out)
        self.assertEqual(self._domain_rows(), [])

    def test_backend_async_exception_path_is_not_changed_by_semantic_anomaly_slice(self):
        from app.error_events.background import capture_backend_async_exception

        try:
            raise RuntimeError("worker forbidden-secret")
        except Exception as exc:
            capture_backend_async_exception(
                exc,
                task_name="path_report_generation",
                execution_scope="background",
                session_id="sess_async",
                project_id="proj_async",
                request_id="req_async_origin",
                correlation_id="rpt_async",
                context_json={"path_id": "path_async", "request_payload": {"secret": "forbidden-secret"}},
            )

        rows = self._async_rows()
        self.assertEqual(len(rows), 1)
        stored = rows[0]
        self.assertEqual(stored.get("event_type"), "backend_async_exception")
        self.assertEqual(stored.get("request_id"), "req_async_origin")
        self.assertEqual(stored.get("correlation_id"), "rpt_async")
        self.assertEqual(stored.get("session_id"), "sess_async")
        self.assertEqual(stored.get("project_id"), "proj_async")
        context = stored.get("context_json") or {}
        self.assertEqual(context.get("execution_scope"), "background")
        self.assertEqual(context.get("task_name"), "path_report_generation")
        self.assertEqual((context.get("request_payload") or {}).get("_redacted"), "payload")
        self.assertNotIn("forbidden-secret", json.dumps(stored, ensure_ascii=False))


if __name__ == "__main__":
    unittest.main()
