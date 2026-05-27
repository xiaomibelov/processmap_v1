import os
import csv
import io
import sqlite3
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class ProductActionsRegistryApiTests(unittest.TestCase):
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

        from app.auth import create_user
        from app.routers.product_actions_registry import (
            ProductActionsRegistryFilters,
            ProductActionsRegistryQueryIn,
            _EXPORT_COLUMNS,
            export_product_actions_registry_csv,
            export_product_actions_registry_xlsx,
            query_product_actions_registry,
            router as product_actions_registry_router,
        )
        from app.storage import (
            get_default_org_id,
            get_project_storage,
            get_storage,
            list_org_workspaces,
            upsert_project_membership,
        )

        self.ProductActionsRegistryFilters = ProductActionsRegistryFilters
        self.ProductActionsRegistryQueryIn = ProductActionsRegistryQueryIn
        self.EXPORT_COLUMNS = _EXPORT_COLUMNS
        self.export_product_actions_registry_csv = export_product_actions_registry_csv
        self.export_product_actions_registry_xlsx = export_product_actions_registry_xlsx
        self.query_product_actions_registry = query_product_actions_registry
        self.product_actions_registry_router = product_actions_registry_router
        self.get_storage = get_storage
        self.get_project_storage = get_project_storage
        self.list_org_workspaces = list_org_workspaces
        self.upsert_project_membership = upsert_project_membership

        self.org_id = get_default_org_id()
        self.admin = create_user("registry-admin@local", "admin", is_admin=False)
        self.viewer = create_user("registry-viewer@local", "viewer", is_admin=False)
        self.admin_id = str(self.admin.get("id") or "")
        self.viewer_id = str(self.viewer.get("id") or "")
        self._insert_membership(self.org_id, self.admin_id, "org_admin")
        self._insert_membership(self.org_id, self.viewer_id, "viewer")

        self.workspace_id = str(self.list_org_workspaces(self.org_id)[0].get("id") or "")
        self.project_a = self.get_project_storage().create("Registry Project A", {}, user_id=self.admin_id, org_id=self.org_id, is_admin=True)
        self.project_b = self.get_project_storage().create("Registry Project B", {}, user_id=self.admin_id, org_id=self.org_id, is_admin=True)
        self.upsert_project_membership(self.org_id, self.project_a, self.viewer_id, "viewer")

        self.session_a1 = self._seed_session(
            self.project_a,
            "Session A1",
            [
                {
                    "id": "act_complete",
                    "product_group": "Сэндвичи",
                    "product_name": "Клаб",
                    "action_type": "нарезка",
                    "action_stage": "подготовка",
                    "action_object_category": "ингредиент",
                    "action_object": "курица",
                    "action_method": "нож",
                    "role": "Повар",
                    "step_id": "step_1",
                    "step_label": "Нарезать курицу",
                    "bpmn_element_id": "Task_1",
                    "source": "manual",
                    "updated_at": "2026-05-07T00:00:00Z",
                }
            ],
            diagram_state_version=7,
        )
        self.session_a2 = self._seed_session(
            self.project_a,
            "Session A2",
            [
                {
                    "id": "act_incomplete",
                    "product_group": "Сэндвичи",
                    "product_name": "",
                    "action_type": "упаковка",
                    "action_object": "",
                    "role": "Упаковщик",
                    "step_id": "step_2",
                    "step_label": "Упаковать",
                    "node_id": "Task_2",
                }
            ],
            diagram_state_version=3,
        )
        self.session_a3_empty = self._seed_session(
            self.project_a,
            "Session A3 Empty",
            [],
            diagram_state_version=1,
        )
        self.session_b1 = self._seed_session(
            self.project_b,
            "Session B1",
            [
                {
                    "id": "act_project_b",
                    "product_group": "Напитки",
                    "product_name": "Лимонад",
                    "action_type": "маркировка",
                    "action_object": "бутылка",
                    "role": "Оператор",
                }
            ],
            diagram_state_version=5,
        )

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

    def _req(self, user: dict):
        return _DummyRequest(user, active_org_id=self.org_id)

    def _seed_session(self, project_id: str, title: str, product_actions: list, *, diagram_state_version: int):
        storage = self.get_storage()
        sid = storage.create(title, roles=["role"], project_id=project_id, org_id=self.org_id, is_admin=True)
        session = storage.load(sid, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(session)
        session.interview = {
            "analysis": {"product_actions": product_actions},
            "report_versions": {"Path_1": [{"report_markdown": "heavy report" * 1000}]},
        }
        session.bpmn_xml = "<bpmn:definitions>" + ("x" * 2000) + "</bpmn:definitions>"
        session.bpmn_meta = {"drawio": {"svg": "y" * 2000}}
        session.diagram_state_version = diagram_state_version
        storage.save(session, org_id=self.org_id, is_admin=True)
        return sid

    def _query(self, **payload):
        return self.query_product_actions_registry(
            self.ProductActionsRegistryQueryIn(**payload),
            self._req(self.admin),
        )

    def test_session_scope_returns_product_actions_without_heavy_payload(self):
        before = self.get_storage().load(self.session_a1, org_id=self.org_id, is_admin=True)
        out = self._query(scope="session", session_id=self.session_a1, limit=10)
        after = self.get_storage().load(self.session_a1, org_id=self.org_id, is_admin=True)

        self.assertTrue(out.get("ok"))
        self.assertEqual(out.get("scope"), "session")
        self.assertEqual(out.get("summary", {}).get("actions_total"), 1)
        self.assertEqual(out.get("applied_filters", {}).get("completeness"), "all")
        self.assertEqual(out.get("metrics", {}).get("total_rows"), 1)
        self.assertEqual(out.get("metrics", {}).get("filtered_rows"), 1)
        self.assertEqual(out.get("metrics", {}).get("page_rows"), 1)
        self.assertEqual(out.get("empty_state", {}).get("kind"), "not_empty")
        self.assertEqual(out.get("source_state", {}).get("namespace"), "/api/analysis/product-actions/registry")
        self.assertIs(out.get("source_state", {}).get("heavy_payload_excluded"), True)
        self.assertIs(out.get("source_state", {}).get("mutation_allowed"), False)
        self.assertIn("Клаб", out.get("filter_options", {}).get("products") or [])
        self.assertEqual(out.get("filter_options", {}).get("completeness"), ["all", "complete", "incomplete"])
        row = out["rows"][0]
        self.assertEqual(row.get("product_name"), "Клаб")
        self.assertEqual(row.get("completeness"), "complete")
        self.assertEqual(row.get("diagram_state_version"), 7)
        for heavy_key in ("bpmn_xml", "interview", "interview_json", "bpmn_meta", "report_versions"):
            self.assertNotIn(heavy_key, row)
            self.assertNotIn(heavy_key, out)
        self.assertEqual(before.diagram_state_version, after.diagram_state_version)
        self.assertEqual(before.bpmn_xml, after.bpmn_xml)

    def test_canonical_endpoint_path_is_registered(self):
        paths = {getattr(route, "path", "") for route in self.product_actions_registry_router.routes}
        self.assertIn("/api/analysis/product-actions/registry/query", paths)
        self.assertIn("/api/analysis/product-actions/registry/export.csv", paths)
        self.assertIn("/api/analysis/product-actions/registry/export.xlsx", paths)

    def test_project_and_workspace_scope_aggregate_multiple_sessions(self):
        project_out = self._query(scope="project", project_id=self.project_a, limit=10)
        self.assertEqual(project_out.get("summary", {}).get("sessions_total"), 2)
        self.assertEqual(project_out.get("summary", {}).get("actions_total"), 2)
        self.assertEqual(project_out.get("summary", {}).get("complete"), 1)
        self.assertEqual(project_out.get("summary", {}).get("incomplete"), 1)

        workspace_out = self._query(scope="workspace", workspace_id=self.workspace_id, limit=10)
        self.assertEqual(workspace_out.get("summary", {}).get("projects_total"), 2)
        self.assertEqual(workspace_out.get("summary", {}).get("sessions_total"), 3)
        self.assertEqual(workspace_out.get("summary", {}).get("actions_total"), 3)
        self.assertEqual(workspace_out.get("session_summary", {}).get("sessions_total"), 4)
        self.assertEqual(workspace_out.get("session_summary", {}).get("sessions_without_actions"), 1)
        row_session_ids = {row.get("session_id") for row in workspace_out.get("rows") or [] if row.get("session_id")}
        summary_session_ids = {item.get("session_id") for item in workspace_out.get("sessions") or [] if item.get("session_id")}
        self.assertGreaterEqual(workspace_out.get("session_summary", {}).get("sessions_total"), len(row_session_ids))
        self.assertTrue(row_session_ids.issubset(summary_session_ids))
        empty_summary = next(
            item for item in workspace_out.get("sessions") or []
            if item.get("session_id") == self.session_a3_empty
        )
        self.assertEqual(empty_summary.get("session_title"), "Session A3 Empty")
        self.assertEqual(empty_summary.get("actions_total"), 0)
        self.assertEqual(empty_summary.get("complete"), 0)
        self.assertEqual(empty_summary.get("incomplete"), 0)
        self.assertEqual(empty_summary.get("project_id"), self.project_a)
        for heavy_key in ("bpmn_xml", "interview", "interview_json", "bpmn_meta", "report_versions", "product_actions"):
            self.assertNotIn(heavy_key, empty_summary)

    def test_filters_and_pagination_work_over_filtered_rows(self):
        filtered = self._query(
            scope="workspace",
            workspace_id=self.workspace_id,
            filters=self.ProductActionsRegistryFilters(product_groups=["Сэндвичи"], completeness="complete"),
            limit=1,
            offset=0,
        )
        self.assertEqual(filtered.get("summary", {}).get("actions_total"), 1)
        self.assertEqual(filtered.get("page", {}).get("total"), 1)
        self.assertFalse(filtered.get("page", {}).get("has_more"))
        self.assertEqual(filtered.get("applied_filters", {}).get("product_groups"), ["Сэндвичи"])
        self.assertEqual(filtered.get("applied_filters", {}).get("completeness"), "complete")
        self.assertEqual(filtered.get("metrics", {}).get("total_rows"), 3)
        self.assertEqual(filtered.get("metrics", {}).get("filtered_rows"), 1)
        self.assertEqual(filtered.get("metrics", {}).get("page_rows"), 1)
        self.assertEqual(filtered.get("metrics", {}).get("complete"), 1)
        self.assertEqual(filtered.get("metrics", {}).get("incomplete"), 0)
        self.assertEqual(filtered.get("metrics", {}).get("total_complete"), 2)
        self.assertEqual(filtered.get("metrics", {}).get("total_incomplete"), 1)
        self.assertFalse(filtered.get("metrics", {}).get("has_more"))
        self.assertIn("Лимонад", filtered.get("filter_options", {}).get("products") or [])
        self.assertEqual(filtered.get("empty_state", {}).get("kind"), "not_empty")
        self.assertEqual(filtered["rows"][0].get("action_type"), "нарезка")

        paged = self._query(scope="workspace", workspace_id=self.workspace_id, limit=1, offset=1)
        self.assertEqual(len(paged.get("rows") or []), 1)
        self.assertEqual(paged.get("page", {}).get("total"), 3)
        self.assertTrue(paged.get("page", {}).get("has_more"))
        self.assertTrue(paged.get("metrics", {}).get("has_more"))

    def test_query_empty_state_and_filter_universe_are_stable_for_no_matches(self):
        out = self._query(
            scope="workspace",
            workspace_id=self.workspace_id,
            filters=self.ProductActionsRegistryFilters(products=["__missing__"]),
            limit=10,
        )
        self.assertEqual(out.get("rows"), [])
        self.assertEqual(out.get("summary", {}).get("actions_total"), 0)
        self.assertEqual(out.get("page", {}).get("total"), 0)
        self.assertEqual(out.get("metrics", {}).get("total_rows"), 3)
        self.assertEqual(out.get("metrics", {}).get("filtered_rows"), 0)
        self.assertEqual(out.get("metrics", {}).get("page_rows"), 0)
        self.assertEqual(out.get("empty_state", {}).get("kind"), "no_filtered_rows")
        self.assertEqual(out.get("applied_filters", {}).get("products"), ["__missing__"])
        self.assertIn("Клаб", out.get("filter_options", {}).get("products") or [])
        self.assertIn("Лимонад", out.get("filter_options", {}).get("products") or [])

    def test_project_with_sessions_but_no_actions_has_no_actions_empty_state(self):
        storage = self.get_storage()
        project_id = self.get_project_storage().create("Empty Registry Project", {}, user_id=self.admin_id, org_id=self.org_id, is_admin=True)
        storage.create("Empty Registry Session", roles=["role"], project_id=project_id, org_id=self.org_id, is_admin=True)

        out = self._query(scope="project", project_id=project_id, limit=10)

        self.assertEqual(out.get("rows"), [])
        self.assertEqual(out.get("summary", {}).get("actions_total"), 0)
        self.assertEqual(out.get("session_summary", {}).get("sessions_total"), 1)
        self.assertEqual(out.get("session_summary", {}).get("sessions_without_actions"), 1)
        self.assertEqual(out.get("empty_state", {}).get("kind"), "no_actions")
        self.assertEqual(out.get("metrics", {}).get("total_rows"), 0)
        self.assertEqual(out.get("source_state", {}).get("actions_scanned"), 0)

    def test_project_scope_denies_inaccessible_project(self):
        with self.assertRaises(HTTPException) as ctx:
            self.query_product_actions_registry(
                self.ProductActionsRegistryQueryIn(scope="project", project_id=self.project_b),
                self._req(self.viewer),
            )
        self.assertEqual(ctx.exception.status_code, 404)

        visible = self.query_product_actions_registry(
            self.ProductActionsRegistryQueryIn(scope="workspace", workspace_id=self.workspace_id, limit=10),
            self._req(self.viewer),
        )
        self.assertEqual(visible.get("summary", {}).get("projects_total"), 1)
        self.assertEqual({row.get("project_id") for row in visible.get("rows") or []}, {self.project_a})

    def test_csv_export_returns_bom_filename_and_stable_columns(self):
        response = self.export_product_actions_registry_csv(
            self.ProductActionsRegistryQueryIn(scope="workspace", workspace_id=self.workspace_id, limit=10),
            self._req(self.admin),
        )
        self.assertEqual(response.media_type, "text/csv; charset=utf-8")
        disposition = response.headers.get("content-disposition", "")
        self.assertIn("product-actions-workspace-", disposition)
        self.assertIn(".csv", disposition)
        body = bytes(response.body)
        self.assertTrue(body.startswith("\xef\xbb\xbf".encode("latin1")))
        text = body.decode("utf-8-sig")
        parsed = list(csv.reader(io.StringIO(text), delimiter=";"))
        self.assertGreaterEqual(len(parsed), 2)
        self.assertEqual(parsed[0], self.EXPORT_COLUMNS)
        product_names = {row[self.EXPORT_COLUMNS.index("product_name")] for row in parsed[1:]}
        self.assertIn("Клаб", product_names)
        completeness = {row[self.EXPORT_COLUMNS.index("completeness")] for row in parsed[1:]}
        self.assertIn("complete", completeness)
        self.assertIn("incomplete", completeness)
        self.assertNotIn("<bpmn:definitions>", text)
        self.assertNotIn("heavy report", text)

    def test_csv_export_escapes_semicolons_quotes_and_newlines(self):
        storage = self.get_storage()
        session = storage.load(self.session_a1, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(session)
        session.interview["analysis"]["product_actions"][0]["product_name"] = 'Клаб "XL";\nновый'
        storage.save(session, org_id=self.org_id, is_admin=True)

        response = self.export_product_actions_registry_csv(
            self.ProductActionsRegistryQueryIn(scope="session", session_id=self.session_a1, limit=10),
            self._req(self.admin),
        )
        text = bytes(response.body).decode("utf-8-sig")
        self.assertIn('"Клаб ""XL"";\nновый"', text)
        parsed = list(csv.reader(io.StringIO(text), delimiter=";"))
        self.assertEqual(parsed[1][self.EXPORT_COLUMNS.index("product_name")], 'Клаб "XL";\nновый')

    def test_xlsx_export_returns_valid_workbook_with_expected_sheet_and_rows(self):
        response = self.export_product_actions_registry_xlsx(
            self.ProductActionsRegistryQueryIn(scope="project", project_id=self.project_a, limit=10),
            self._req(self.admin),
        )
        self.assertEqual(response.media_type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.assertIn("product-actions-project-", response.headers.get("content-disposition", ""))
        body = bytes(response.body)
        with zipfile.ZipFile(io.BytesIO(body)) as workbook:
            names = set(workbook.namelist())
            self.assertIn("xl/workbook.xml", names)
            self.assertIn("xl/worksheets/sheet1.xml", names)
            workbook_xml = workbook.read("xl/workbook.xml").decode("utf-8")
            sheet_xml = workbook.read("xl/worksheets/sheet1.xml").decode("utf-8")
        self.assertIn('name="Product actions"', workbook_xml)
        self.assertIn("workspace_title", sheet_xml)
        self.assertIn("Клаб", sheet_xml)
        self.assertIn("Task_1", sheet_xml)
        self.assertNotIn("<bpmn:definitions>", sheet_xml)
        self.assertNotIn("heavy report", sheet_xml)

    def test_export_filters_and_zero_rows_are_handled(self):
        query = self._query(
            scope="workspace",
            workspace_id=self.workspace_id,
            filters=self.ProductActionsRegistryFilters(product_groups=["Напитки"], completeness="complete"),
            limit=10,
        )
        filtered = self.export_product_actions_registry_csv(
            self.ProductActionsRegistryQueryIn(
                scope="workspace",
                workspace_id=self.workspace_id,
                filters=self.ProductActionsRegistryFilters(product_groups=["Напитки"], completeness="complete"),
                limit=10,
            ),
            self._req(self.admin),
        )
        parsed = list(csv.reader(io.StringIO(bytes(filtered.body).decode("utf-8-sig")), delimiter=";"))
        self.assertEqual(len(parsed), 2)
        self.assertEqual(parsed[1][self.EXPORT_COLUMNS.index("product_name")], "Лимонад")
        self.assertEqual([row.get("product_name") for row in query.get("rows") or []], ["Лимонад"])
        self.assertEqual(
            [row[self.EXPORT_COLUMNS.index("product_name")] for row in parsed[1:]],
            [row.get("product_name") for row in query.get("rows") or []],
        )

        empty = self.export_product_actions_registry_csv(
            self.ProductActionsRegistryQueryIn(
                scope="workspace",
                workspace_id=self.workspace_id,
                filters=self.ProductActionsRegistryFilters(products=["__missing__"]),
                limit=10,
            ),
            self._req(self.admin),
        )
        parsed_empty = list(csv.reader(io.StringIO(bytes(empty.body).decode("utf-8-sig")), delimiter=";"))
        self.assertEqual(parsed_empty, [self.EXPORT_COLUMNS])

    def test_export_scope_guard_matches_registry_query(self):
        with self.assertRaises(HTTPException) as ctx:
            self.export_product_actions_registry_csv(
                self.ProductActionsRegistryQueryIn(scope="project", project_id=self.project_b),
                self._req(self.viewer),
            )
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
