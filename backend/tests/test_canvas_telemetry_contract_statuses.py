"""Contract-guard контура feature/canvas-telemetry-feed.

CI contract-fuzz (schemathesis STRICT_CHECKS, UndocumentedStatusCode) упал на
GET /api/admin/canvas-telemetry/errors/{group_id}/context: endpoint возвращает
404 {"detail":"group not found"}, но в OpenAPI задокументирован только 200.

Гард: для каждой новой операции контура реальные ответы в состояниях
«не найдено / не админ / нет auth / валидация / rate-limit» обязаны входить
в множество статусов, задокументированных в app.openapi() для операции.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient  # noqa: E402

CONTOUR_OPERATIONS = {
    "ingest": ("post", "/api/telemetry/canvas-events"),
    "admin_list": ("get", "/api/admin/canvas-telemetry/errors"),
    "admin_context": ("get", "/api/admin/canvas-telemetry/errors/{group_id}/context"),
}


def _documented_statuses(openapi_schema: dict, method: str, path: str) -> set[int]:
    operation = openapi_schema.get("paths", {}).get(path, {}).get(method, {})
    statuses = {int(code) for code in (operation.get("responses") or {}).keys() if str(code).isdigit()}
    # 'default' покрывает любой статус
    if "default" in (operation.get("responses") or {}):
        statuses.update(range(100, 600))
    return statuses


class CanvasTelemetryContractStatusesTest(unittest.TestCase):
    def setUp(self):
        from app.auth import create_access_token, create_user
        from app.startup.app_factory import create_app
        from app.domains.storage.canvas_telemetry import repository as repo
        import app.routers.canvas_telemetry as router_mod

        repo._reset_schema_flag_for_tests()
        router_mod._reset_rate_limiter_for_tests()

        self.app = create_app()
        self.client = TestClient(self.app)
        self.admin = create_user("canvas.contract@local", "strongpass1", is_admin=True)
        self.admin_token = create_access_token(
            self.admin["id"] if isinstance(self.admin, dict) else self.admin
        )
        self.user = create_user("canvas.contract.user@local", "strongpass1", is_admin=False)
        self.user_token = create_access_token(
            self.user["id"] if isinstance(self.user, dict) else self.user
        )
        self.openapi = self.app.openapi()

    def _assert_documented(self, operation_key: str, response):
        method, path = CONTOUR_OPERATIONS[operation_key]
        documented = _documented_statuses(self.openapi, method, path)
        self.assertIn(
            int(response.status_code),
            documented,
            f"{operation_key} {method.upper()} {path}: status {response.status_code} "
            f"not documented in OpenAPI (documented: {sorted(documented)})",
        )

    # -- admin list -----------------------------------------------------------
    def test_admin_list_no_auth_401_documented(self):
        resp = self.client.get("/api/admin/canvas-telemetry/errors")
        self.assertEqual(resp.status_code, 401)
        self._assert_documented("admin_list", resp)

    def test_admin_list_non_admin_403_documented(self):
        resp = self.client.get(
            "/api/admin/canvas-telemetry/errors",
            headers={"Authorization": f"Bearer {self.user_token}"},
        )
        self.assertEqual(resp.status_code, 403)
        self._assert_documented("admin_list", resp)

    def test_admin_list_garbage_filter_200_documented(self):
        resp = self.client.get(
            "/api/admin/canvas-telemetry/errors?session_id=%%%&error_class=nope&converged=7",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        self.assertEqual(resp.status_code, 200)
        self._assert_documented("admin_list", resp)

    # -- admin context ----------------------------------------------------------
    def test_admin_context_no_auth_401_documented(self):
        resp = self.client.get("/api/admin/canvas-telemetry/errors/nope/context")
        self._assert_documented("admin_context", resp)

    def test_admin_context_non_admin_403_documented(self):
        resp = self.client.get(
            "/api/admin/canvas-telemetry/errors/nope/context",
            headers={"Authorization": f"Bearer {self.user_token}"},
        )
        self.assertEqual(resp.status_code, 403)
        self._assert_documented("admin_context", resp)

    def test_admin_context_not_found_404_documented(self):
        resp = self.client.get(
            "/api/admin/canvas-telemetry/errors/grp_missing/context",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        self.assertEqual(resp.status_code, 404)
        self._assert_documented("admin_context", resp)

    # -- ingest -----------------------------------------------------------------
    def test_ingest_no_auth_401_documented(self):
        resp = self.client.post(
            "/api/telemetry/canvas-events",
            json={"events": [{"event_id": "e1", "kind": "command", "session_id": "s1"}]},
        )
        self.assertEqual(resp.status_code, 401)
        self._assert_documented("ingest", resp)

    def test_ingest_invalid_kind_422_documented(self):
        resp = self.client.post(
            "/api/telemetry/canvas-events",
            headers={"Authorization": f"Bearer {self.admin_token}"},
            json={"events": [{"event_id": "e1", "kind": "wat", "session_id": "s1"}]},
        )
        self.assertEqual(resp.status_code, 422)
        self._assert_documented("ingest", resp)

    def test_ingest_rate_limit_429_documented(self):
        import app.routers.canvas_telemetry as router_mod

        old = router_mod.get_rate_limit_per_minute()
        router_mod.set_rate_limit_per_minute(2)
        try:
            events = [{"event_id": f"e{i}", "kind": "command", "session_id": "s_rl"} for i in range(3)]
            resp = self.client.post(
                "/api/telemetry/canvas-events",
                headers={"Authorization": f"Bearer {self.admin_token}"},
                json={"events": events},
            )
        finally:
            router_mod.set_rate_limit_per_minute(old)
        self.assertEqual(resp.status_code, 429)
        self._assert_documented("ingest", resp)


if __name__ == "__main__":
    unittest.main()
