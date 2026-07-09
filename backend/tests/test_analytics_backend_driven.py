import os
import sqlite3
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


class AnalyticsBackendDrivenTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_db_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_database_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "processmap.sqlite3")
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        from app.db.config import get_db_runtime_config

        get_db_runtime_config.cache_clear()
        try:
            import app.storage as storage_module

            storage_module._SCHEMA_READY = False
            storage_module._SCHEMA_DB_FILE = ""
            storage_module._PG_POOL = None
        except Exception:
            pass

        from app.auth import create_access_token, create_user
        from app.startup.app_factory import create_app
        from app.storage import get_default_org_id, get_storage, list_org_workspaces

        self.app = create_app()
        self.client = TestClient(self.app)
        self.get_storage = get_storage
        self.org_id = get_default_org_id()
        self.admin = create_user("analytics-admin@local", "admin", is_admin=False)
        self.viewer = create_user("analytics-viewer@local", "viewer", is_admin=False)
        self.other = create_user("analytics-other@local", "viewer", is_admin=False)
        self.admin_id = str(self.admin.get("id") or "")
        self.viewer_id = str(self.viewer.get("id") or "")
        self.other_id = str(self.other.get("id") or "")
        self._insert_membership(self.org_id, self.admin_id, "org_admin")
        self._insert_membership(self.org_id, self.viewer_id, "viewer")
        self._insert_membership(self.org_id, self.other_id, "viewer")

        self.workspace_id = str(list_org_workspaces(self.org_id)[0].get("id") or "")
        from app.storage import get_project_storage

        self.project_id = get_project_storage().create("Analytics Project", {}, user_id=self.admin_id, org_id=self.org_id, is_admin=True)
        from app.storage import upsert_project_membership

        upsert_project_membership(self.org_id, self.project_id, self.viewer_id, "viewer")
        self.session_id = get_storage().create(
            "Analytics Session",
            project_id=self.project_id,
            user_id=self.admin_id,
            org_id=self.org_id,
            is_admin=True,
        )

        with sqlite3.connect(str(self._db_path())) as con:
            con.row_factory = sqlite3.Row
            con.execute(
                """
                INSERT INTO analytics_session_snapshots
                (session_id, org_id, project_id, workspace_id, total_duration_min, critical_path_min,
                 actions_total, actions_by_role_json, actions_by_section_json, actions_by_type_json,
                 handoffs_count, open_questions, critical_questions, unknown_duration_nodes_json, computed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    self.session_id, self.org_id, self.project_id, self.workspace_id,
                    120, 90, 15, '{"Повар": 10, "Упаковщик": 5}',
                    '{"Подготовка": 10, "Упаковка": 5}', '{"нарезка": 8, "упаковка": 7}',
                    3, 2, 1, '[]', 1710000000,
                ),
            )
            con.execute(
                """
                INSERT INTO analytics_project_snapshots
                (project_id, org_id, workspace_id, sessions_count, total_actions, avg_duration_min,
                 total_critical_questions, handoffs_count, computed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (self.project_id, self.org_id, self.workspace_id, 2, 25, 60.5, 2, 5, 1710000000),
            )
            con.execute(
                """
                INSERT INTO analytics_workspace_snapshots
                (workspace_id, org_id, projects_count, sessions_count, total_actions, avg_duration_min,
                 total_critical_questions, handoffs_count, computed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (self.workspace_id, self.org_id, 1, 2, 25, 60.5, 2, 5, 1710000000),
            )
            con.commit()

        self.admin_token = create_access_token(self.admin_id)
        self.viewer_token = create_access_token(self.viewer_id)
        self.other_token = create_access_token(self.other_id)

    def tearDown(self):
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        if self.old_db_backend is None:
            os.environ.pop("FPC_DB_BACKEND", None)
        else:
            os.environ["FPC_DB_BACKEND"] = self.old_db_backend
        if self.old_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self.old_database_url
        try:
            from app.db.config import get_db_runtime_config

            get_db_runtime_config.cache_clear()
            import app.storage as storage_module

            storage_module._SCHEMA_READY = False
            storage_module._SCHEMA_DB_FILE = ""
            storage_module._PG_POOL = None
        except Exception:
            pass
        self.tmp.cleanup()

    def _db_path(self) -> Path:
        return Path(self.tmp.name) / "processmap.sqlite3"

    def _insert_membership(self, org_id: str, user_id: str, role: str):
        _ = self.get_storage()
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                """
                INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at)
                VALUES (?, ?, ?, strftime('%s','now'))
                """,
                [org_id, user_id, role],
            )
            con.execute(
                "UPDATE org_memberships SET role = ? WHERE org_id = ? AND user_id = ?",
                [role, org_id, user_id],
            )
            con.commit()

    def _headers(self, token: str):
        return {"Authorization": f"Bearer {token}"}

    def test_dashboard_session_returns_envelope(self):
        r = self.client.get(
            f"/api/analytics/dashboard?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["data"]["scope_type"], "session")
        self.assertEqual(body["data"]["actions_total"], 15)
        self.assertEqual(body["meta"]["scope_type"], "session")

    def test_dashboard_project_returns_envelope(self):
        r = self.client.get(
            f"/api/analytics/project/{self.project_id}/dashboard",
            headers=self._headers(self.viewer_token),
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["data"]["scope_type"], "project")
        self.assertEqual(body["data"]["sessions_count"], 2)

    def test_properties_requires_auth(self):
        r = self.client.get(f"/api/analytics/properties?scope=session&scope_id={self.session_id}")
        self.assertEqual(r.status_code, 401)

    def test_actions_forbidden_for_non_member(self):
        r = self.client.get(
            f"/api/analytics/actions?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.other_token),
        )
        self.assertEqual(r.status_code, 403)

    def test_dashboard_404_for_unknown_scope(self):
        r = self.client.get(
            "/api/analytics/dashboard?scope=session&scope_id=unknown",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 404)

    def test_export_properties_csv_requires_auth(self):
        r = self.client.get(f"/api/analytics/properties/export.csv?scope=session&scope_id={self.session_id}")
        self.assertEqual(r.status_code, 401)

    def test_properties_summary_session_returns_envelope(self):
        r = self.client.get(
            f"/api/analytics/properties/summary?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["success"])
        self.assertIn("total", body["data"])
        self.assertIn("by_family", body["data"])
        self.assertIn("top_used", body["data"])

    def test_properties_summary_forbidden_for_non_member(self):
        r = self.client.get(
            f"/api/analytics/properties/summary?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.other_token),
        )
        self.assertEqual(r.status_code, 403)

    def test_actions_summary_session_returns_envelope(self):
        r = self.client.get(
            f"/api/analytics/actions/summary?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["success"])
        self.assertIn("total", body["data"])
        self.assertIn("by_role", body["data"])
        self.assertIn("by_type", body["data"])

    def test_actions_summary_forbidden_for_non_member(self):
        r = self.client.get(
            f"/api/analytics/actions/summary?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.other_token),
        )
        self.assertEqual(r.status_code, 403)

    def test_property_value_type_inference(self):
        from app.routers.analytics import _infer_property_value_type, _infer_property_family

        self.assertEqual(_infer_property_value_type("duration", "5 мин"), "duration")
        self.assertEqual(_infer_property_value_type("mixTime", "10"), "number")
        self.assertEqual(_infer_property_value_type("config", '{"a":1}'), "json")
        self.assertEqual(_infer_property_value_type("note", "sugar"), "string")
        self.assertEqual(_infer_property_family("ingredient1", "string"), "ingredient")
        self.assertEqual(_infer_property_family("equipment", "string"), "equipment")
        self.assertEqual(_infer_property_family("fpc-visible", "ui_config"), "ui_config")

    def test_export_properties_xlsx_returns_valid_file(self):
        r = self.client.get(
            f"/api/analytics/properties/export.xlsx?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            r.headers["content-type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn("properties-session-", r.headers.get("content-disposition", ""))
        # xlsx files start with PK signature
        self.assertTrue(r.content.startswith(b"PK"))
        self.assertGreater(len(r.content), 100)

    def test_export_actions_xlsx_returns_valid_file(self):
        r = self.client.get(
            f"/api/analytics/actions/export.xlsx?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            r.headers["content-type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn("actions-session-", r.headers.get("content-disposition", ""))
        self.assertTrue(r.content.startswith(b"PK"))
        self.assertGreater(len(r.content), 100)

    def test_dashboard_cached_response_is_consistent(self):
        # Even when Redis is unavailable the endpoint must return the same shape.
        r1 = self.client.get(
            f"/api/analytics/dashboard?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        r2 = self.client.get(
            f"/api/analytics/dashboard?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r1.json()["data"], r2.json()["data"])

    def test_dashboard_session_has_kpi_extras(self):
        r = self.client.get(
            f"/api/analytics/dashboard?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        data = r.json()["data"]
        self.assertIn("kpi", data)
        self.assertIn("task_statuses", data)
        self.assertIn("activity_heatmap", data)
        self.assertIn("bpmn_element_types", data)
        self.assertEqual(data["kpi"]["total_sessions"], 1)
        self.assertEqual(data["kpi"]["total_tasks"], 15)

    def test_dashboard_project_has_trend_and_process_duration(self):
        # Update session snapshot with realistic BPMN type keys so extras are populated.
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                """
                UPDATE analytics_session_snapshots
                SET actions_by_type_json = ?,
                    total_duration_min = ?
                WHERE session_id = ?
                """,
                ('{"step": 5, "decision": 2, "fork": 1, "join": 1, "timer": 2, "message": 1, "loss_event": 1}', 75, self.session_id),
            )
            con.commit()

        r = self.client.get(
            f"/api/analytics/project/{self.project_id}/dashboard",
            headers=self._headers(self.viewer_token),
        )
        self.assertEqual(r.status_code, 200)
        data = r.json()["data"]
        self.assertEqual(data["scope_type"], "project")
        self.assertIn("session_trend", data)
        self.assertIn("process_duration", data)
        self.assertIn("bpmn_element_types", data)
        bpmn = data["bpmn_element_types"]
        self.assertEqual(bpmn["task"], 5)
        self.assertEqual(bpmn["gateway"], 4)
        self.assertEqual(bpmn["event"], 4)
        statuses = data["task_statuses"]
        self.assertEqual(statuses["completed"], 5)
        self.assertEqual(statuses["active"], 4)
        self.assertEqual(statuses["pending"], 3)
        self.assertEqual(statuses["failed"], 1)
        self.assertEqual(len(data["activity_heatmap"]["by_hour"]), 24)
        self.assertEqual(len(data["activity_heatmap"]["by_weekday"]), 7)
        self.assertGreaterEqual(data["kpi"]["active_now"], 1)

    def test_dashboard_workspace_returns_extras(self):
        r = self.client.get(
            f"/api/analytics/dashboard?scope=workspace&scope_id={self.workspace_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        data = r.json()["data"]
        self.assertEqual(data["scope_type"], "workspace")
        self.assertIn("kpi", data)
        self.assertIn("session_trend", data)
        self.assertEqual(data["kpi"]["unique_processes"], data["projects_count"])

    def test_recalculate_helper_happy_path(self):
        from app.routers.analytics import _build_recalculated_rows

        rows = [
            {"bpmn_id": "op1", "bpmn_name": "Operation 1", "name": "ee_time", "value": "3,61"},
            {"bpmn_id": "op1", "bpmn_name": "Operation 1", "name": "ingredient_value", "value": "1"},
        ]
        out = _build_recalculated_rows(rows)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["bpmn_id"], "op1")
        self.assertEqual(out[0]["ee_time"], 3.61)
        self.assertEqual(out[0]["ingredient_value"], 1.0)
        self.assertEqual(out[0]["result"], 3.61)

    def test_recalculate_helper_invalid_ingredient_value_is_skipped(self):
        from app.routers.analytics import _build_recalculated_rows

        rows = [
            {"bpmn_id": "op1", "bpmn_name": "Operation 1", "name": "ee_time", "value": "3.61"},
            {"bpmn_id": "op1", "bpmn_name": "Operation 1", "name": "ingredient_value", "value": "abc"},
        ]
        out = _build_recalculated_rows(rows)
        self.assertEqual(out, [])

    def _set_session_bpmn_meta(self, meta: dict):
        storage = self.get_storage()
        storage.patch_session_meta(
            self.session_id,
            bpmn_meta=meta,
            base_diagram_state_version=0,
            user_id=self.admin_id,
            org_id=self.org_id,
            is_admin=True,
        )

    def test_export_properties_recalculated_xlsx_happy_path(self):
        self._set_session_bpmn_meta({
            "camunda_extensions_by_element_id": {
                "op1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "ee_time", "value": "3.61"},
                            {"name": "ingredient_value", "value": "1"},
                        ]
                    }
                }
            }
        })
        r = self.client.get(
            f"/api/analytics/properties/export-recalculated.xlsx?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            r.headers["content-type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn("properties-recalculated-session-", r.headers.get("content-disposition", ""))
        self.assertTrue(r.content.startswith(b"PK"))

    def test_export_properties_recalculated_xlsx_skips_invalid_rows(self):
        self._set_session_bpmn_meta({
            "camunda_extensions_by_element_id": {
                "op1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "ee_time", "value": "3.61"},
                            {"name": "ingredient_value", "value": ""},
                        ]
                    }
                }
            }
        })
        r = self.client.get(
            f"/api/analytics/properties/export-recalculated.xlsx?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            r.headers["content-type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertTrue(r.content.startswith(b"PK"))

    def test_export_properties_recalculated_xlsx_requires_auth(self):
        r = self.client.get(
            f"/api/analytics/properties/export-recalculated.xlsx?scope=session&scope_id={self.session_id}",
        )
        self.assertEqual(r.status_code, 401)
