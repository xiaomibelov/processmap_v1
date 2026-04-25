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


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class AdminErrorEventsRetrievalTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "admin_error_events.sqlite3")
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

        from app.auth import create_user
        from app.routers.admin import admin_error_event_detail, admin_error_events
        from app.storage import append_error_event, get_default_org_id, list_user_org_memberships

        self.admin_error_events = admin_error_events
        self.admin_error_event_detail = admin_error_event_detail
        self.append_error_event = append_error_event
        self.default_org_id = get_default_org_id()
        self.admin = create_user("telemetry.admin@local", "strongpass1", is_admin=True)
        self.viewer = create_user("telemetry.viewer@local", "strongpass1", is_admin=False)
        list_user_org_memberships(str(self.viewer.get("id") or ""), is_admin=False)
        self.request = _DummyRequest(self.admin, active_org_id=self.default_org_id)
        self.viewer_request = _DummyRequest(self.viewer, active_org_id=self.default_org_id)
        self._seed_events()

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

    def _append(
        self,
        *,
        event_id: str,
        occurred_at: int,
        event_type: str,
        source: str,
        request_id: str = "",
        correlation_id: str = "",
        session_id: str = "",
        runtime_id: str = "",
        severity: str = "error",
    ):
        self.append_error_event(
            id=event_id,
            schema_version=1,
            occurred_at=occurred_at,
            ingested_at=occurred_at + 10,
            source=source,
            event_type=event_type,
            severity=severity,
            message=f"{event_type} message",
            user_id=str(self.admin.get("id") or ""),
            org_id=self.default_org_id,
            session_id=session_id,
            project_id="proj_timeline",
            route=f"/api/sessions/{session_id or 'none'}",
            runtime_id=runtime_id,
            tab_id="tab_timeline",
            request_id=request_id,
            correlation_id=correlation_id,
            app_version="test",
            git_sha="abc123",
            fingerprint=f"fp_{event_id}",
            context_json={
                "method": "GET",
                "safe": "ok",
                "authorization": "Bearer forbidden-secret",
                "request_body": {"token": "forbidden-secret"},
            },
        )

    def _seed_events(self):
        self._append(
            event_id="evt_api_failure",
            occurred_at=100,
            event_type="api_failure",
            source="frontend",
            request_id="req_incident_1",
            correlation_id="corr_incident_1",
            session_id="sess_timeline",
            runtime_id="rt_timeline",
        )
        self._append(
            event_id="evt_backend_exception",
            occurred_at=110,
            event_type="backend_exception",
            source="backend",
            request_id="req_incident_1",
            correlation_id="corr_incident_1",
            session_id="sess_timeline",
            runtime_id="",
        )
        self._append(
            event_id="evt_backend_async",
            occurred_at=115,
            event_type="backend_async_exception",
            source="backend",
            request_id="",
            correlation_id="corr_incident_1",
            session_id="sess_timeline",
            runtime_id="",
        )
        self._append(
            event_id="evt_save_reload",
            occurred_at=200,
            event_type="save_reload_anomaly",
            source="frontend",
            request_id="req_save_1",
            correlation_id="corr_save_1",
            session_id="sess_timeline",
            runtime_id="rt_timeline",
        )
        self._append(
            event_id="evt_domain_invariant",
            occurred_at=300,
            event_type="domain_invariant_violation",
            source="backend",
            request_id="req_domain_1",
            correlation_id="rpt_path_report_1",
            session_id="sess_timeline",
            runtime_id="rt_timeline",
            severity="warn",
        )
        self._append(
            event_id="evt_path_report_async",
            occurred_at=310,
            event_type="backend_async_exception",
            source="backend",
            request_id="",
            correlation_id="rpt_path_report_1",
            session_id="sess_timeline",
            runtime_id="",
        )
        self._append(
            event_id="evt_sparse_no_correlation",
            occurred_at=320,
            event_type="backend_async_exception",
            source="backend",
            request_id="",
            correlation_id="",
            session_id="sess_timeline",
            runtime_id="",
        )
        self._append(
            event_id="evt_other_session",
            occurred_at=400,
            event_type="api_failure",
            source="frontend",
            request_id="req_other",
            correlation_id="corr_other",
            session_id="sess_other",
            runtime_id="rt_other",
        )

    def _query(self, **overrides):
        params = {
            "session_id": "",
            "request_id": "",
            "correlation_id": "",
            "user_id": "",
            "org_id": "",
            "runtime_id": "",
            "event_type": "",
            "source": "",
            "severity": "",
            "occurred_from": 0,
            "occurred_to": 0,
            "limit": 50,
            "offset": 0,
            "order": "asc",
        }
        params.update(overrides)
        return self.admin_error_events(self.request, **params)

    def test_list_query_by_session_id_returns_ordered_rows(self):
        out = self._query(session_id="sess_timeline")
        self.assertTrue(bool(out.get("ok")))
        items = out.get("items") or []
        self.assertEqual([item.get("occurred_at") for item in items], [100, 110, 115, 200, 300, 310, 320])
        self.assertEqual(
            [item.get("id") for item in items],
            [
                "evt_api_failure",
                "evt_backend_exception",
                "evt_backend_async",
                "evt_save_reload",
                "evt_domain_invariant",
                "evt_path_report_async",
                "evt_sparse_no_correlation",
            ],
        )
        self.assertEqual((out.get("timeline") or {}).get("deduped"), False)
        self.assertNotIn("forbidden-secret", json.dumps(out, ensure_ascii=False))
        self.assertEqual(((items[0].get("context_json") or {}).get("request_body") or {}).get("_redacted"), "payload")
        self.assertEqual((items[0].get("context_json") or {}).get("authorization"), "[REDACTED]")

    def test_query_by_request_id_returns_correlated_frontend_backend_rows(self):
        out = self._query(request_id="req_incident_1")
        items = out.get("items") or []
        self.assertEqual([item.get("event_type") for item in items], ["api_failure", "backend_exception"])
        self.assertEqual([item.get("source") for item in items], ["frontend", "backend"])
        self.assertTrue(all(item.get("request_id") == "req_incident_1" for item in items))

    def test_query_by_correlation_id_returns_raw_ordered_cross_type_timeline(self):
        out = self._query(correlation_id="corr_incident_1")
        self.assertTrue(bool(out.get("ok")))
        self.assertEqual((out.get("filters") or {}).get("correlation_id"), "corr_incident_1")
        items = out.get("items") or []
        self.assertEqual(
            [item.get("id") for item in items],
            ["evt_api_failure", "evt_backend_exception", "evt_backend_async"],
        )
        self.assertEqual([item.get("occurred_at") for item in items], [100, 110, 115])
        self.assertEqual(
            [item.get("event_type") for item in items],
            ["api_failure", "backend_exception", "backend_async_exception"],
        )
        self.assertTrue(all(item.get("correlation_id") == "corr_incident_1" for item in items))

    def test_query_by_path_report_correlation_id_returns_related_rows(self):
        out = self._query(correlation_id="rpt_path_report_1")
        items = out.get("items") or []
        self.assertEqual(
            [item.get("id") for item in items],
            ["evt_domain_invariant", "evt_path_report_async"],
        )
        self.assertEqual([item.get("occurred_at") for item in items], [300, 310])

    def test_event_id_endpoint_returns_exact_item(self):
        out = self.admin_error_event_detail("evt_backend_exception", self.request)
        self.assertTrue(bool(out.get("ok")))
        item = out.get("item") or {}
        self.assertEqual(item.get("id"), "evt_backend_exception")
        self.assertEqual(item.get("event_type"), "backend_exception")
        self.assertEqual(item.get("request_id"), "req_incident_1")

    def test_auth_admin_restriction_works(self):
        out = self.admin_error_events(
            self.viewer_request,
            session_id="sess_timeline",
            request_id="",
            correlation_id="",
            user_id="",
            org_id="",
            runtime_id="",
            event_type="",
            source="",
            severity="",
            occurred_from=0,
            occurred_to=0,
            limit=10,
            offset=0,
            order="asc",
        )
        self.assertEqual(getattr(out, "status_code", 0), 403)

    def test_limit_filter_behavior_works(self):
        out = self._query(
            runtime_id="rt_timeline",
            source="frontend",
            severity="error",
            occurred_from=100,
            occurred_to=250,
            limit=1,
        )
        self.assertTrue(bool(out.get("ok")))
        self.assertEqual((out.get("page") or {}).get("limit"), 1)
        self.assertEqual((out.get("page") or {}).get("total"), 2)
        self.assertEqual(len(out.get("items") or []), 1)
        self.assertEqual((out.get("items") or [])[0].get("id"), "evt_api_failure")

    def test_empty_result_is_safe_and_predictable(self):
        out = self._query(request_id="req_missing")
        self.assertTrue(bool(out.get("ok")))
        self.assertEqual(out.get("items"), [])
        self.assertEqual(out.get("count"), 0)
        self.assertEqual((out.get("page") or {}).get("total"), 0)

    def test_sparse_rows_without_correlation_id_do_not_match_correlation_filter(self):
        out = self._query(correlation_id="corr_missing")
        self.assertTrue(bool(out.get("ok")))
        self.assertEqual(out.get("items"), [])
        self.assertEqual(out.get("count"), 0)


if __name__ == "__main__":
    unittest.main()
