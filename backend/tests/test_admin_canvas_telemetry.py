"""Admin-read тесты витрины: GET /api/admin/canvas-telemetry/errors(+context) — A6."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient  # noqa: E402


def _raw_event(event_id, kind, ts, session_id="s_1", payload=None):
    return {
        "session_id": session_id,
        "event_id": event_id,
        "seq": 1,
        "ts": ts,
        "kind": kind,
        "project_id": "p_1",
        "user_id": "u_1",
        "org_id": "org_1",
        "payload": payload or {},
    }


class AdminCanvasTelemetryTest(unittest.TestCase):
    def setUp(self):
        from app.auth import create_access_token, create_user
        from app.startup.app_factory import create_app
        from app.domains.storage.canvas_telemetry import repository as repo

        repo._reset_schema_flag_for_tests()
        self.repo = repo

        self.app = create_app()
        self.client = TestClient(self.app)
        self.admin = create_user("canvas.admin@local", "strongpass1", is_admin=True)
        self.admin_token = create_access_token(
            self.admin["id"] if isinstance(self.admin, dict) else self.admin
        )
        self.user = create_user("canvas.user@local", "strongpass1", is_admin=False)
        self.user_token = create_access_token(
            self.user["id"] if isinstance(self.user, dict) else self.user
        )

        self.repo.append_canvas_events([
            _raw_event("e1", "command", 1000),
            _raw_event("e2", "error", 1100, payload={
                "http": {"status": 422},
                "error": {"code": "OPERATION_UNSUPPORTED", "opId": "op_x", "opType": "move", "reason": "bpmn_xml_parse_error"},
            }),
        ])
        from app.save_services.canvas_telemetry_aggregator.aggregate import aggregate_pending_sessions

        aggregate_pending_sessions()

    def _get(self, path, token):
        headers = {"Authorization": f"Bearer {token}"}
        return self.client.get(path, headers=headers)

    def test_admin_lists_error_groups(self):
        resp = self._get("/api/admin/canvas-telemetry/errors", self.admin_token)
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        self.assertEqual(len(body["items"]), 1)
        item = body["items"][0]
        self.assertEqual(item["error_class"], "ops_422")
        self.assertEqual(item["session_id"], "s_1")

    def test_non_admin_forbidden(self):
        resp = self._get("/api/admin/canvas-telemetry/errors", self.user_token)
        self.assertEqual(resp.status_code, 403)

    def test_filter_by_session(self):
        resp = self._get("/api/admin/canvas-telemetry/errors?session_id=s_other", self.admin_token)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["items"], [])

    def test_filter_by_error_class(self):
        resp = self._get("/api/admin/canvas-telemetry/errors?error_class=network", self.admin_token)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["items"], [])

    def test_context_endpoint(self):
        listing = self._get("/api/admin/canvas-telemetry/errors", self.admin_token).json()
        group_id = listing["items"][0]["id"]
        resp = self._get(f"/api/admin/canvas-telemetry/errors/{group_id}/context", self.admin_token)
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        timeline = body["timeline"]
        self.assertGreater(len(timeline), 0)
        self.assertEqual(timeline[-1]["kind"], "error")

    def test_context_404_unknown_id(self):
        resp = self._get("/api/admin/canvas-telemetry/errors/nope/context", self.admin_token)
        self.assertEqual(resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()
