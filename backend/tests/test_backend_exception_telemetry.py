import asyncio
import importlib
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

import httpx
from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class BackendExceptionTelemetryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "backend_exception.sqlite3")
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
        from app.storage import get_default_org_id, get_storage

        self.create_access_token = create_access_token
        self.default_org_id = get_default_org_id()
        self.admin = create_user("backend.exception.admin@local", "strongpass1", is_admin=True)
        _ = get_storage()
        self.app = create_app()
        self._install_probe_routes()

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

    def _install_probe_routes(self):
        @self.app.get("/api/telemetry-proof/backend-exception")
        def backend_exception_probe():
            raise RuntimeError("backend proof failure secret_token_should_not_leak")

        @self.app.get("/api/telemetry-proof/handled-404")
        def handled_404_probe():
            raise HTTPException(status_code=404, detail="expected_missing")

    def _auth_headers(self, **extra):
        token = self.create_access_token(str(self.admin.get("id") or ""))
        headers = {"Authorization": f"Bearer {token}"}
        headers.update(extra)
        return headers

    async def _get_async(self, path: str, *, headers: dict):
        transport = httpx.ASGITransport(app=self.app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.get(path, headers=headers)

    def _backend_exception_rows(self, request_id: str):
        con = sqlite3.connect(self.db_path)
        con.row_factory = sqlite3.Row
        try:
            rows = con.execute(
                """
                SELECT id, source, event_type, severity, message, user_id, org_id, route,
                       request_id, context_json
                  FROM error_events
                 WHERE event_type = 'backend_exception' AND request_id = ?
                 ORDER BY ingested_at DESC, id DESC
                """,
                [request_id],
            ).fetchall()
        finally:
            con.close()
        return [dict(row) for row in rows]

    def _assert_backend_exception_row(self, row: dict, *, request_id: str):
        self.assertEqual(row.get("source"), "backend")
        self.assertEqual(row.get("event_type"), "backend_exception")
        self.assertEqual(row.get("severity"), "error")
        self.assertEqual(row.get("user_id"), str(self.admin.get("id") or ""))
        self.assertEqual(row.get("org_id"), self.default_org_id)
        self.assertEqual(row.get("route"), "/api/telemetry-proof/backend-exception")
        self.assertEqual(row.get("request_id"), request_id)
        context = json.loads(str(row.get("context_json") or "{}"))
        self.assertEqual(context.get("method"), "GET")
        self.assertEqual(context.get("route"), "/api/telemetry-proof/backend-exception")
        self.assertEqual(context.get("path"), "/api/telemetry-proof/backend-exception")
        self.assertEqual(context.get("status_code"), 500)
        self.assertEqual(context.get("exception_type"), "RuntimeError")
        self.assertEqual((context.get("_server") or {}).get("capture"), "backend_exception_middleware")
        self.assertNotIn("secret_token_should_not_leak", json.dumps(row, ensure_ascii=False))
        self.assertNotIn("backend proof failure", json.dumps(row, ensure_ascii=False))

    def test_unhandled_backend_exception_persists_generated_request_id_event(self):
        response = asyncio.run(
            self._get_async(
                "/api/telemetry-proof/backend-exception",
                headers=self._auth_headers(),
            )
        )
        self.assertEqual(response.status_code, 500)
        request_id = str(response.headers.get("X-Request-Id") or "")
        self.assertTrue(request_id.startswith("req_"))
        self.assertEqual(str(response.json().get("request_id") or ""), request_id)
        self.assertNotIn("secret_token_should_not_leak", response.text)

        rows = self._backend_exception_rows(request_id)
        self.assertEqual(len(rows), 1)
        self._assert_backend_exception_row(rows[0], request_id=request_id)
        context = json.loads(str(rows[0].get("context_json") or "{}"))
        self.assertEqual((context.get("_server") or {}).get("request_id_source"), "generated")

    def test_unhandled_backend_exception_preserves_explicit_client_request_id(self):
        request_id = "req_backend_exception_explicit_1"
        response = asyncio.run(
            self._get_async(
                "/api/telemetry-proof/backend-exception",
                headers=self._auth_headers(**{"X-Client-Request-Id": request_id}),
            )
        )
        self.assertEqual(response.status_code, 500)
        self.assertEqual(str(response.headers.get("X-Request-Id") or ""), request_id)
        self.assertEqual(str(response.json().get("request_id") or ""), request_id)

        rows = self._backend_exception_rows(request_id)
        self.assertEqual(len(rows), 1)
        self._assert_backend_exception_row(rows[0], request_id=request_id)
        context = json.loads(str(rows[0].get("context_json") or "{}"))
        self.assertEqual((context.get("_server") or {}).get("request_id_source"), "x-client-request-id")

    def test_expected_handled_404_does_not_emit_backend_exception(self):
        request_id = "req_expected_handled_404"
        response = asyncio.run(
            self._get_async(
                "/api/telemetry-proof/handled-404",
                headers=self._auth_headers(**{"X-Client-Request-Id": request_id}),
            )
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self._backend_exception_rows(request_id), [])


if __name__ == "__main__":
    unittest.main()
