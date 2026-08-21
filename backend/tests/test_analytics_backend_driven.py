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

    def test_recalculate_helper_invalid_ingredient_value_emits_null_result(self):
        from app.routers.analytics import _build_recalculated_rows

        rows = [
            {"bpmn_id": "op1", "bpmn_name": "Operation 1", "name": "ee_time", "value": "3.61"},
            {"bpmn_id": "op1", "bpmn_name": "Operation 1", "name": "ingredient_value", "value": "abc"},
        ]
        out = _build_recalculated_rows(rows)
        # ee_time is enough to emit a row; unresolvable ingredient_value -> null result.
        self.assertEqual(len(out), 1)
        self.assertAlmostEqual(out[0]["ee_time"], 3.61)
        self.assertIsNone(out[0]["ingredient_value"])
        self.assertIsNone(out[0]["result"])
        self.assertIsNone(out[0]["source"])

    def test_parse_recalc_number_accepts_coefficient_times_n(self):
        from app.routers.analytics import _parse_recalc_number

        # Per-unit coefficient form "<number>*n" -> leading coefficient.
        self.assertAlmostEqual(_parse_recalc_number("0,33*n"), 0.33)
        self.assertAlmostEqual(_parse_recalc_number("0,08*n"), 0.08)
        self.assertAlmostEqual(_parse_recalc_number("1,5 * n"), 1.5)
        self.assertAlmostEqual(_parse_recalc_number("0,33*N"), 0.33)
        # Plain numerics and invalids are unaffected.
        self.assertAlmostEqual(_parse_recalc_number("3,61"), 3.61)
        self.assertIsNone(_parse_recalc_number(""))
        self.assertIsNone(_parse_recalc_number("abc"))
        self.assertIsNone(_parse_recalc_number("0,33*n+1"))

    def test_parse_recalc_number_accepts_comparison_prefix(self):
        from app.routers.analytics import _parse_recalc_number

        # Leading threshold/comparison prefix is stripped.
        self.assertAlmostEqual(_parse_recalc_number(">10"), 10)
        self.assertAlmostEqual(_parse_recalc_number("<5"), 5)
        self.assertAlmostEqual(_parse_recalc_number("> 10"), 10)
        self.assertAlmostEqual(_parse_recalc_number("<0,5"), 0.5)
        # Non-numeric after the prefix still falls through to None.
        self.assertIsNone(_parse_recalc_number(">abc"))
        self.assertIsNone(_parse_recalc_number("<"))
        # No over-parse: trailing operators after *n are NOT dropped.
        self.assertIsNone(_parse_recalc_number("0,33*n+1"))

    def test_recalculate_helper_exports_coefficient_times_n_rows(self):
        from app.routers.analytics import _build_recalculated_rows

        rows = [
            {"bpmn_id": "op1", "bpmn_name": "Op 1", "name": "ee_time", "value": "0,33*n"},
            {"bpmn_id": "op1", "bpmn_name": "Op 1", "name": "ingredient_value", "value": "10"},
            {"bpmn_id": "op2", "bpmn_name": "Op 2", "name": "ee_time", "value": "0,08*n"},
            {"bpmn_id": "op2", "bpmn_name": "Op 2", "name": "ingredient_value", "value": "5"},
            # ee_time without ingredient_value is still emitted (result=None, source=None).
            {"bpmn_id": "op3", "bpmn_name": "Op 3", "name": "ee_time", "value": "0,33*n"},
        ]
        out = _build_recalculated_rows(rows)
        self.assertEqual(len(out), 3)
        by_id = {r["bpmn_id"]: r for r in out}
        self.assertAlmostEqual(by_id["op1"]["ee_time"], 0.33)
        self.assertAlmostEqual(by_id["op1"]["result"], round(0.33 * 10, 2))
        self.assertAlmostEqual(by_id["op2"]["ee_time"], 0.08)
        self.assertAlmostEqual(by_id["op2"]["result"], round(0.08 * 5, 2))
        self.assertIn("op3", by_id)
        self.assertAlmostEqual(by_id["op3"]["ee_time"], 0.33)
        self.assertIsNone(by_id["op3"]["result"])
        self.assertIsNone(by_id["op3"]["source"])

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

    def test_recalculate_helper_uses_catalog_when_property_missing(self):
        from app.routers.analytics import _build_recalculated_rows

        rows = [
            {"bpmn_id": "op1", "bpmn_name": "Op 1", "name": "ee_time", "value": "0,33*n"},
            {"bpmn_id": "op1", "bpmn_name": "Op 1", "name": "ingredient", "value": "Рис"},
        ]
        out = _build_recalculated_rows(rows, catalog_values={"рис": 1.2})
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["source"], "catalog")
        self.assertAlmostEqual(out[0]["ingredient_value"], 1.2)
        self.assertAlmostEqual(out[0]["result"], round(0.33 * 1.2, 2))

    def test_recalculate_helper_property_wins_over_catalog(self):
        from app.routers.analytics import _build_recalculated_rows

        rows = [
            {"bpmn_id": "op1", "name": "ee_time", "value": "2"},
            {"bpmn_id": "op1", "name": "ingredient_value", "value": "5"},
            {"bpmn_id": "op1", "name": "ingredient", "value": "Рис"},
        ]
        out = _build_recalculated_rows(rows, catalog_values={"рис": 99})
        self.assertEqual(out[0]["source"], "property")
        self.assertAlmostEqual(out[0]["ingredient_value"], 5.0)

    def test_recalculate_helper_carries_context_fields(self):
        from app.routers.analytics import _build_recalculated_rows

        rows = [
            {"bpmn_id": "op1", "bpmn_name": "Op 1", "name": "ee_time", "value": "2",
             "session_id": "s1", "session_title": "Sess", "project_id": "p1",
             "project_title": "Proj", "workspace_id": "w1", "org_id": "o1"},
            {"bpmn_id": "op1", "name": "ingredient_value", "value": "3"},
        ]
        out = _build_recalculated_rows(rows)
        self.assertEqual(out[0]["session_id"], "s1")
        self.assertEqual(out[0]["session_title"], "Sess")
        self.assertEqual(out[0]["workspace_id"], "w1")
        self.assertEqual(out[0]["org_id"], "o1")
        self.assertEqual(out[0]["source_url"], "/app?session=s1")

    def test_get_properties_recalculation_requires_auth(self):
        r = self.client.get(
            f"/api/analytics/properties/recalculation?scope=session&scope_id={self.session_id}",
        )
        self.assertEqual(r.status_code, 401)

    def test_get_properties_recalculation_shape_missing_ingredient_uses_default(self):
        from app.routers.analytics import _SOURCE_DEFAULT

        self._set_session_bpmn_meta({
            "camunda_extensions_by_element_id": {
                "op1": {"properties": {"extensionProperties": [
                    {"name": "ee_time", "value": "5.0"},
                ]}}
            }
        })
        r = self.client.get(
            f"/api/analytics/properties/recalculation?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        payload = r.json()
        self.assertTrue(payload["success"])
        data = payload["data"]
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["resolved"], 1)
        row = data["rows"][0]
        self.assertEqual(row["source"], _SOURCE_DEFAULT)
        self.assertEqual(row["ingredient_value"], "")
        self.assertAlmostEqual(row["result"], 5.0)

    def test_classify_recalc_value_case_a_missing_ingredient(self):
        from app.routers.analytics import _MISSING, _SOURCE_DEFAULT, classify_recalc_value

        self.assertEqual(
            classify_recalc_value(5.0, _MISSING, False),
            {"result": 5.0, "source": _SOURCE_DEFAULT, "is_invalid": False},
        )
        self.assertEqual(
            classify_recalc_value(720.0, _MISSING, False),
            {"result": 720.0, "source": _SOURCE_DEFAULT, "is_invalid": False},
        )
        # presence flag takes precedence over a supplied value.
        self.assertEqual(
            classify_recalc_value(3.0, "2", False),
            {"result": 3.0, "source": _SOURCE_DEFAULT, "is_invalid": False},
        )

    def test_classify_recalc_value_case_a_zero_ee_time(self):
        from app.routers.analytics import _MISSING, _SOURCE_DEFAULT, classify_recalc_value

        self.assertEqual(
            classify_recalc_value(0.0, _MISSING, False),
            {"result": 0.0, "source": _SOURCE_DEFAULT, "is_invalid": False},
        )

    def test_classify_recalc_value_case_b_empty_or_whitespace(self):
        from app.routers.analytics import _SOURCE_NO_DATA, classify_recalc_value

        for value in ("", "   ", "—"):
            with self.subTest(value=value):
                self.assertEqual(
                    classify_recalc_value(3.0, value, True),
                    {"result": None, "source": _SOURCE_NO_DATA, "is_invalid": True},
                )

    def test_classify_recalc_value_case_b_invalid_text(self):
        from app.routers.analytics import _SOURCE_NO_DATA, classify_recalc_value

        result = classify_recalc_value(3.0, "abc", True)
        self.assertIsNone(result["result"])
        self.assertEqual(result["source"], _SOURCE_NO_DATA)
        self.assertTrue(result["is_invalid"])

    def test_classify_recalc_value_case_c_comma_decimal_normalized(self):
        from app.routers.analytics import _SOURCE_PROPERTY, classify_recalc_value

        # Product-owner decision 21/08/26: single comma as decimal separator is valid.
        self.assertEqual(
            classify_recalc_value(2.0, "0,5", True),
            {"result": 1.0, "source": _SOURCE_PROPERTY, "is_invalid": False},
        )

    def test_classify_recalc_value_case_b_multi_comma_not_normalized(self):
        from app.routers.analytics import _SOURCE_NO_DATA, classify_recalc_value

        result = classify_recalc_value(3.0, "1,2,3", True)
        self.assertIsNone(result["result"])
        self.assertEqual(result["source"], _SOURCE_NO_DATA)
        self.assertTrue(result["is_invalid"])

    def test_classify_recalc_value_case_b_prefix_not_normalized(self):
        from app.routers.analytics import _SOURCE_NO_DATA, classify_recalc_value

        result = classify_recalc_value(3.0, "> 10", True)
        self.assertIsNone(result["result"])
        self.assertEqual(result["source"], _SOURCE_NO_DATA)
        self.assertTrue(result["is_invalid"])

    def test_classify_recalc_value_case_c_number_string(self):
        from app.routers.analytics import _SOURCE_PROPERTY, classify_recalc_value

        self.assertEqual(
            classify_recalc_value(2.0, "3", True),
            {"result": 6.0, "source": _SOURCE_PROPERTY, "is_invalid": False},
        )

    def test_classify_recalc_value_case_c_number_int_and_float(self):
        from app.routers.analytics import _SOURCE_PROPERTY, classify_recalc_value

        self.assertEqual(
            classify_recalc_value(4.0, 2, True),
            {"result": 8.0, "source": _SOURCE_PROPERTY, "is_invalid": False},
        )
        self.assertEqual(
            classify_recalc_value(4.0, 2.5, True),
            {"result": 10.0, "source": _SOURCE_PROPERTY, "is_invalid": False},
        )

    def test_classify_recalc_value_case_c_zero_is_valid(self):
        from app.routers.analytics import _SOURCE_PROPERTY, classify_recalc_value

        self.assertEqual(
            classify_recalc_value(5.0, "0", True),
            {"result": 0.0, "source": _SOURCE_PROPERTY, "is_invalid": False},
        )

    def test_classify_recalc_value_case_c_negative_number_is_valid(self):
        from app.routers.analytics import _SOURCE_PROPERTY, classify_recalc_value

        self.assertEqual(
            classify_recalc_value(5.0, "-1", True),
            {"result": -5.0, "source": _SOURCE_PROPERTY, "is_invalid": False},
        )

    def test_classify_recalc_value_present_true_with_missing_sentinel(self):
        from app.routers.analytics import _MISSING, _SOURCE_NO_DATA, classify_recalc_value

        # If caller erroneously marks the property present but passes the sentinel,
        # it is treated as empty (case B) rather than as absent.
        self.assertEqual(
            classify_recalc_value(3.0, _MISSING, True),
            {"result": None, "source": _SOURCE_NO_DATA, "is_invalid": True},
        )

    def test_export_properties_recalculated_xlsx_source_mode_200(self):
        self._set_session_bpmn_meta({
            "camunda_extensions_by_element_id": {
                "op1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "ee_time", "value": "2.5"},
                            {"name": "ingredient_value", "value": "2"},
                            {"name": "ingredient", "value": "Котлеты ПФ"},
                            {"name": "ee_operation", "value": "Смешивание"},
                            {"name": "ingredient_um", "value": "кг"},
                        ]
                    }
                }
            }
        })
        r = self.client.get(
            f"/api/analytics/properties/export-recalculated.xlsx?scope=session&scope_id={self.session_id}&mode=source",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            r.headers["content-type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn("properties-source-session-", r.headers.get("content-disposition", ""))
        self.assertTrue(r.content.startswith(b"PK"))

    def test_export_properties_recalculated_xlsx_source_mode_missing_ingredient(self):
        self._set_session_bpmn_meta({
            "camunda_extensions_by_element_id": {
                "op1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "ee_time", "value": "3.0"},
                        ]
                    }
                }
            }
        })
        r = self.client.get(
            f"/api/analytics/properties/export-recalculated.xlsx?scope=session&scope_id={self.session_id}&mode=source",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            r.headers["content-type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertTrue(r.content.startswith(b"PK"))

    def test_export_properties_recalculated_xlsx_source_mode_422_empty_ingredient(self):
        self._set_session_bpmn_meta({
            "camunda_extensions_by_element_id": {
                "op1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "ee_time", "value": "3.0"},
                            {"name": "ingredient_value", "value": ""},
                        ]
                    }
                }
            }
        })
        r = self.client.get(
            f"/api/analytics/properties/export-recalculated.xlsx?scope=session&scope_id={self.session_id}&mode=source",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 422)
        body = r.json()
        self.assertIn("invalid_tasks", body)
        self.assertEqual(len(body["invalid_tasks"]), 1)
        self.assertEqual(body["invalid_tasks"][0]["bpmn_id"], "op1")
        self.assertEqual(body["invalid_tasks"][0]["ingredient_value"], "")

    def test_export_properties_recalculated_xlsx_source_mode_422_invalid_ingredient(self):
        self._set_session_bpmn_meta({
            "camunda_extensions_by_element_id": {
                "op1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "ee_time", "value": "3.0"},
                            {"name": "ingredient_value", "value": "abc"},
                        ]
                    }
                }
            }
        })
        r = self.client.get(
            f"/api/analytics/properties/export-recalculated.xlsx?scope=session&scope_id={self.session_id}&mode=source",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 422)
        body = r.json()
        self.assertIn("invalid_tasks", body)
        self.assertEqual(len(body["invalid_tasks"]), 1)
        self.assertEqual(body["invalid_tasks"][0]["ingredient_value"], "abc")

    def test_export_properties_recalculated_xlsx_source_mode_200_missing_ingredient(self):
        self._set_session_bpmn_meta({
            "camunda_extensions_by_element_id": {
                "op1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "ee_time", "value": "3.0"},
                        ]
                    }
                }
            }
        })
        r = self.client.get(
            f"/api/analytics/properties/export-recalculated.xlsx?scope=session&scope_id={self.session_id}&mode=source",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)

    def test_export_properties_recalculated_xlsx_source_mode_200_mixed_a_and_c(self):
        self._set_session_bpmn_meta({
            "camunda_extensions_by_element_id": {
                "op1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "ee_time", "value": "3.0"},
                            {"name": "ingredient_value", "value": "2"},
                        ]
                    }
                },
                "op2": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "ee_time", "value": "5.0"},
                        ]
                    }
                },
            }
        })
        r = self.client.get(
            f"/api/analytics/properties/export-recalculated.xlsx?scope=session&scope_id={self.session_id}&mode=source",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)

    def test_export_properties_recalculated_xlsx_source_mode_422_multiple_invalid(self):
        self._set_session_bpmn_meta({
            "camunda_extensions_by_element_id": {
                "op1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "ee_time", "value": "3.0"},
                            {"name": "ingredient_value", "value": ""},
                        ]
                    }
                },
                "op2": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "ee_time", "value": "5.0"},
                            {"name": "ingredient_value", "value": "abc"},
                        ]
                    }
                },
                "op3": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "ee_time", "value": "1.0"},
                        ]
                    }
                },
            }
        })
        r = self.client.get(
            f"/api/analytics/properties/export-recalculated.xlsx?scope=session&scope_id={self.session_id}&mode=source",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 422)
        body = r.json()
        self.assertIn("invalid_tasks", body)
        self.assertEqual(len(body["invalid_tasks"]), 2)
        by_id = {t["bpmn_id"]: t for t in body["invalid_tasks"]}
        self.assertIn("op1", by_id)
        self.assertIn("op2", by_id)
        self.assertEqual(by_id["op1"]["ingredient_value"], "")
        self.assertEqual(by_id["op2"]["ingredient_value"], "abc")

    def _build_source_rows_single(self, rows):
        from app.routers.analytics import _build_source_rows

        out = _build_source_rows(rows)
        self.assertEqual(len(out), 1)
        return out[0]

    def test_build_source_rows_export_shape_case_c_all_fields(self):
        from app.routers.analytics import _SOURCE_PROPERTY

        row = self._build_source_rows_single([
            {"bpmn_id": "op1", "bpmn_name": "Mix A", "name": "ee_time", "value": "2,5"},
            {"bpmn_id": "op1", "name": "ingredient_value", "value": "2"},
            {"bpmn_id": "op1", "name": "ingredient", "value": "Котлеты ПФ"},
            {"bpmn_id": "op1", "name": "ee_operation", "value": "Смешивание"},
            {"bpmn_id": "op1", "name": "ingredient_um", "value": "кг"},
        ])
        self.assertEqual(row["bpmn_id"], "op1")
        self.assertAlmostEqual(row["ee_time"], 2.5)
        self.assertEqual(row["ingredient"], "Котлеты ПФ")
        self.assertEqual(row["ee_operation"], "Смешивание")
        self.assertEqual(row["ingredient_value"], "2")
        self.assertEqual(row["ingredient_um"], "кг")
        self.assertEqual(row["source"], _SOURCE_PROPERTY)
        self.assertAlmostEqual(row["result"], 5.0)

    def test_build_source_rows_export_shape_case_a_missing_ingredient(self):
        from app.routers.analytics import _SOURCE_DEFAULT

        row = self._build_source_rows_single([
            {"bpmn_id": "op1", "bpmn_name": "Mix A", "name": "ee_time", "value": "5.0"},
            {"bpmn_id": "op1", "name": "ee_operation", "value": "Перемешать"},
        ])
        self.assertEqual(row["ee_operation"], "Перемешать")
        self.assertEqual(row["ingredient_value"], "")
        self.assertEqual(row["ingredient_um"], "")
        self.assertEqual(row["source"], _SOURCE_DEFAULT)
        self.assertAlmostEqual(row["result"], 5.0)

    def test_build_source_rows_export_shape_case_b_empty_ingredient(self):
        from app.routers.analytics import _SOURCE_NO_DATA

        row = self._build_source_rows_single([
            {"bpmn_id": "op1", "bpmn_name": "Mix A", "name": "ee_time", "value": "3.0"},
            {"bpmn_id": "op1", "name": "ingredient_value", "value": ""},
            {"bpmn_id": "op1", "name": "ingredient_um", "value": "кг"},
        ])
        self.assertEqual(row["ingredient_value"], "")
        self.assertEqual(row["ingredient_um"], "кг")
        self.assertEqual(row["source"], _SOURCE_NO_DATA)
        self.assertIsNone(row["result"])

    def test_build_source_rows_export_shape_case_c_without_um(self):
        from app.routers.analytics import _SOURCE_PROPERTY

        row = self._build_source_rows_single([
            {"bpmn_id": "op1", "bpmn_name": "Mix A", "name": "ee_time", "value": "4.0"},
            {"bpmn_id": "op1", "name": "ingredient_value", "value": "2"},
            {"bpmn_id": "op1", "name": "ingredient", "value": "Соль"},
        ])
        self.assertEqual(row["ingredient_value"], "2")
        self.assertEqual(row["ingredient_um"], "")
        self.assertEqual(row["source"], _SOURCE_PROPERTY)
        self.assertAlmostEqual(row["result"], 8.0)

    def test_build_source_rows_export_shape_um_without_ingredient_value_is_ignored(self):
        from app.routers.analytics import _SOURCE_DEFAULT

        row = self._build_source_rows_single([
            {"bpmn_id": "op1", "bpmn_name": "Mix A", "name": "ee_time", "value": "6.0"},
            {"bpmn_id": "op1", "name": "ingredient_um", "value": "кг"},
        ])
        self.assertEqual(row["ingredient_value"], "")
        self.assertEqual(row["ingredient_um"], "")
        self.assertEqual(row["source"], _SOURCE_DEFAULT)
        self.assertAlmostEqual(row["result"], 6.0)

    def test_build_source_rows_ee_time_with_comma_decimal_case_a(self):
        from app.routers.analytics import _SOURCE_DEFAULT

        row = self._build_source_rows_single([
            {"bpmn_id": "op1", "bpmn_name": "Mix A", "name": "ee_time", "value": "0,5"},
        ])
        self.assertEqual(row["source"], _SOURCE_DEFAULT)
        self.assertAlmostEqual(row["ee_time"], 0.5)
        self.assertAlmostEqual(row["result"], 0.5)

    def test_build_source_rows_ee_time_and_ingredient_with_comma_decimal_case_c(self):
        from app.routers.analytics import _SOURCE_PROPERTY

        row = self._build_source_rows_single([
            {"bpmn_id": "op1", "bpmn_name": "Mix A", "name": "ee_time", "value": "0,5"},
            {"bpmn_id": "op1", "name": "ingredient_value", "value": "0,4"},
        ])
        self.assertEqual(row["source"], _SOURCE_PROPERTY)
        self.assertAlmostEqual(row["ee_time"], 0.5)
        self.assertAlmostEqual(row["result"], 0.2)

    def test_export_properties_recalculated_xlsx_source_mode_requires_auth(self):
        r = self.client.get(
            f"/api/analytics/properties/export-recalculated.xlsx?scope=session&scope_id={self.session_id}&mode=source",
        )
        self.assertEqual(r.status_code, 401)

    def test_refresh_session_requires_auth(self):
        r = self.client.post(f"/api/analytics/refresh?scope=session&scope_id={self.session_id}")
        self.assertEqual(r.status_code, 401)

    def test_refresh_session_returns_envelope(self):
        r = self.client.post(
            f"/api/analytics/refresh?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["data"]["scope_type"], "session")
        self.assertEqual(body["data"]["scope_id"], self.session_id)

    def test_refresh_project_returns_envelope(self):
        r = self.client.post(
            f"/api/analytics/refresh?scope=project&scope_id={self.project_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["data"]["scope_type"], "project")
        self.assertEqual(body["meta"]["refreshed_sessions"], 1)

    def test_refresh_workspace_returns_envelope(self):
        r = self.client.post(
            f"/api/analytics/refresh?scope=workspace&scope_id={self.workspace_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["data"]["scope_type"], "workspace")

    def test_refresh_forbidden_for_non_member(self):
        r = self.client.post(
            f"/api/analytics/refresh?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.other_token),
        )
        self.assertEqual(r.status_code, 403)

    def test_quality_requires_auth(self):
        r = self.client.get(f"/api/analytics/quality?scope=session&scope_id={self.session_id}")
        self.assertEqual(r.status_code, 401)

    def test_quality_forbidden_for_non_member(self):
        r = self.client.get(
            f"/api/analytics/quality?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.other_token),
        )
        self.assertEqual(r.status_code, 403)

    def test_quality_empty_scope_returns_zeroes(self):
        r = self.client.get(
            f"/api/analytics/quality?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["data"]["ee_time_filled_pct"], 0)
        self.assertEqual(body["data"]["no_data_count"], 0)

    def test_quality_case_a_and_c(self):
        self._set_session_bpmn_meta({
            "camunda_extensions_by_element_id": {
                "op1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "ee_time", "value": "2.0"},
                            {"name": "ingredient_value", "value": "3"},
                        ]
                    }
                },
                "op2": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "ee_time", "value": "5.0"},
                        ]
                    }
                },
                "op3": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "ee_time", "value": "1.0"},
                            {"name": "ingredient_value", "value": ""},
                        ]
                    }
                },
            }
        })
        r = self.client.get(
            f"/api/analytics/quality?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["data"]["total_elements_with_ee_time"], 3)
        self.assertEqual(body["data"]["no_data_count"], 1)
        self.assertEqual(body["data"]["ingredient_numeric_pct"], 50.0)
        self.assertEqual(body["data"]["ee_time_filled_pct"], 100)

    def test_celery_beat_schedule_has_nightly_refresh(self):
        from app.celery_app import app

        schedule = app.conf.beat_schedule.get("analytics-nightly-refresh")
        self.assertIsNotNone(schedule)
        self.assertEqual(schedule["task"], "app.save_services.analytics_aggregator.tasks.refresh_all_workspaces_analytics_task")
        self.assertEqual(app.conf.timezone, "Europe/Moscow")
        cron = schedule["schedule"]
        self.assertIn(4, cron.hour)
        self.assertIn(30, cron.minute)
