import asyncio
import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path

import httpx

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class ErrorEventsIntakeApiTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "error_events.sqlite3")
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
        import app.startup.app_factory as app_factory
        import app.routers as routers
        import app.routers.error_events as error_events_router

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        importlib.reload(error_events_router)
        importlib.reload(routers)
        importlib.reload(app_factory)

        from app.auth import create_access_token, create_user
        from app.startup.app_factory import create_app
        from app.storage import get_default_org_id, get_error_event, get_storage

        self.create_access_token = create_access_token
        self.get_error_event = get_error_event
        self.default_org_id = get_default_org_id()
        self.admin = create_user("error.admin@local", "strongpass1", is_admin=True)
        _ = get_storage()
        self.app = create_app()

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

    async def _post_async(self, path: str, *, json: dict, headers: dict):
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.post(path, json=json, headers=headers)

    def _auth_headers(self, **extra):
        token = self.create_access_token(str(self.admin.get("id") or ""))
        base = {
            "Authorization": f"Bearer {token}",
            "X-Client-Request-Id": "req_manual_error_intake_1",
        }
        base.update(extra)
        return base

    def test_authenticated_post_persists_redacted_enriched_event(self):
        payload = {
            "schema_version": 1,
            "event_type": "save_reload_anomaly",
            "severity": "error",
            "message": "Save pipeline failed",
            "occurred_at": 1710000000,
            "source": "frontend",
            "user_id": "client_claim_user",
            "org_id": "client_claim_org",
            "session_id": "sess_123",
            "project_id": "proj_456",
            "route": "/projects/proj_456/sessions/sess_123",
            "runtime_id": "runtime_1",
            "tab_id": "tab_1",
            "correlation_id": "corr_1",
            "app_version": "1.2.3",
            "git_sha": "abc123",
            "context_json": {
                "headers": {
                    "authorization": "Bearer super-secret",
                    "cookie": "session=secret",
                    "x-safe": "ok",
                },
                "bpmn_xml": "<xml>super sensitive</xml>",
                "request_body": {"payload": "must not be stored raw"},
                "draft_payload": {"draft": True},
                "small": "ok",
            },
        }
        response = asyncio.run(
            self._post_async(
                "/api/telemetry/error-events",
                json=payload,
                headers=self._auth_headers(),
            )
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertTrue(bool(body.get("ok")))
        item = body.get("item") or {}
        event_id = str(item.get("id") or "")
        self.assertTrue(event_id)
        self.assertEqual(str(item.get("request_id") or ""), "req_manual_error_intake_1")

        stored = self.get_error_event(event_id)
        self.assertIsNotNone(stored)
        stored = stored or {}
        self.assertEqual(str(stored.get("user_id") or ""), str(self.admin.get("id") or ""))
        self.assertEqual(str(stored.get("org_id") or ""), self.default_org_id)
        self.assertEqual(str(stored.get("route") or ""), "/projects/proj_456/sessions/sess_123")
        self.assertEqual(str(stored.get("request_id") or ""), "req_manual_error_intake_1")
        self.assertTrue(str(stored.get("fingerprint") or ""))
        context = stored.get("context_json") or {}
        headers = context.get("headers") or {}
        self.assertEqual(headers.get("authorization"), "[REDACTED]")
        self.assertEqual(headers.get("cookie"), "[REDACTED]")
        self.assertEqual(headers.get("x-safe"), "ok")
        self.assertEqual((context.get("bpmn_xml") or {}).get("_redacted"), "bpmn_xml")
        self.assertEqual((context.get("request_body") or {}).get("_redacted"), "payload")
        self.assertEqual((context.get("draft_payload") or {}).get("_redacted"), "payload")
        server_meta = context.get("_server") or {}
        self.assertEqual(server_meta.get("ingest_path"), "/api/telemetry/error-events")
        self.assertEqual(server_meta.get("client_claimed_user_id"), "client_claim_user")
        self.assertEqual(server_meta.get("client_claimed_org_id"), "client_claim_org")

    def test_rejects_unknown_schema_version(self):
        payload = {
            "schema_version": 999,
            "event_type": "frontend_fatal",
            "severity": "fatal",
            "message": "boom",
            "source": "frontend",
            "context_json": {},
        }
        response = asyncio.run(
            self._post_async(
                "/api/telemetry/error-events",
                json=payload,
                headers=self._auth_headers(),
            )
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
