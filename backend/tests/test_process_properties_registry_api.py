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


class ProcessPropertiesRegistryApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.pop("PROCESS_DB_PATH", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        from app.auth import create_user
        from app.routers.process_properties_registry import (
            ProcessPropertiesRegistryFilters,
            ProcessPropertiesRegistryQueryIn,
            _EXPORT_COLUMNS,
            export_process_properties_registry_csv,
            export_process_properties_registry_xlsx,
            query_process_properties_registry,
            router as process_properties_registry_router,
        )
        from app.storage import (
            get_default_org_id,
            get_project_storage,
            get_storage,
            list_org_workspaces,
            upsert_project_membership,
        )

        self.ProcessPropertiesRegistryFilters = ProcessPropertiesRegistryFilters
        self.ProcessPropertiesRegistryQueryIn = ProcessPropertiesRegistryQueryIn
        self.EXPORT_COLUMNS = _EXPORT_COLUMNS
        self.export_process_properties_registry_csv = export_process_properties_registry_csv
        self.export_process_properties_registry_xlsx = export_process_properties_registry_xlsx
        self.query_process_properties_registry = query_process_properties_registry
        self.process_properties_registry_router = process_properties_registry_router
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
            {
                "camunda_extensions_by_element_id": {
                    "Task_1": {
                        "properties": {
                            "extensionProperties": [
                                {"id": "p1", "name": "priority", "value": "high"},
                            ],
                            "extensionListeners": [
                                {"id": "l1", "event": "start", "type": "class", "value": "com.example.StartListener"},
                            ],
                        }
                    }
                }
            },
            diagram_state_version=7,
            bpmn_xml='<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="Process_1" name="Process One"><bpmn:task id="Task_1" name="Task One" /></bpmn:process></bpmn:definitions>',
        )
        self.session_a2 = self._seed_session(
            self.project_a,
            "Session A2",
            {
                "camunda_extensions_by_element_id": {
                    "Task_2": {
                        "properties": {
                            "extensionProperties": [
                                {"id": "p2", "name": "owner", "value": ""},
                            ]
                        }
                    }
                }
            },
            diagram_state_version=3,
            bpmn_xml='<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="Process_2" name="Process Two"><bpmn:task id="Task_2" name="Task Two" /></bpmn:process></bpmn:definitions>',
        )
        self.session_a3_empty = self._seed_session(
            self.project_a,
            "Session A3 Empty",
            {"camunda_extensions_by_element_id": {}},
            diagram_state_version=1,
        )
        self.session_b1 = self._seed_session(
            self.project_b,
            "Session B1",
            {
                "camunda_extensions_by_element_id": {
                    "ServiceTask_1": {
                        "properties": {
                            "extensionProperties": [
                                {"id": "p3", "name": "service", "value": "approval"},
                            ]
                        }
                    }
                }
            },
            diagram_state_version=5,
            bpmn_xml='<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="Process_3" name="Process Three"><bpmn:serviceTask id="ServiceTask_1" name="Service Task One" /></bpmn:process></bpmn:definitions>',
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

    def _seed_session(self, project_id: str, title: str, bpmn_meta: dict, *, diagram_state_version: int, bpmn_xml: str = ""):
        storage = self.get_storage()
        sid = storage.create(title, roles=["role"], project_id=project_id, org_id=self.org_id, is_admin=True)
        session = storage.load(sid, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(session)
        session.bpmn_meta = bpmn_meta
        session.bpmn_xml = bpmn_xml or ("<bpmn:definitions>" + ("x" * 2000) + "</bpmn:definitions>")
        session.interview = {"report_versions": {"Path_1": [{"report_markdown": "heavy report" * 1000}]}}
        session.diagram_state_version = diagram_state_version
        storage.save(session, org_id=self.org_id, is_admin=True)
        return sid

    def _query(self, **payload):
        return self.query_process_properties_registry(
            self.ProcessPropertiesRegistryQueryIn(**payload),
            self._req(self.admin),
        )

    def test_session_scope_returns_properties_without_heavy_payload(self):
        before = self.get_storage().load(self.session_a1, org_id=self.org_id, is_admin=True)
        out = self._query(scope="session", session_id=self.session_a1, limit=10)
        after = self.get_storage().load(self.session_a1, org_id=self.org_id, is_admin=True)

        self.assertTrue(out.get("ok"))
        self.assertEqual(out.get("scope"), "session")
        self.assertEqual(out.get("summary", {}).get("actions_total"), 2)
        row_names = {row.get("property_name") for row in out.get("rows", [])}
        self.assertIn("priority", row_names)
        self.assertIn("start / class", row_names)
        for heavy_key in ("bpmn_xml", "interview", "interview_json", "bpmn_meta", "report_versions"):
            for row in out.get("rows", []):
                self.assertNotIn(heavy_key, row)
            self.assertNotIn(heavy_key, out)
        self.assertEqual(before.diagram_state_version, after.diagram_state_version)
        self.assertEqual(before.bpmn_xml, after.bpmn_xml)

    def test_canonical_endpoint_path_is_registered(self):
        paths = {getattr(route, "path", "") for route in self.process_properties_registry_router.routes}
        self.assertIn("/api/analysis/properties/registry/query", paths)
        self.assertIn("/api/analysis/properties/registry/export.csv", paths)
        self.assertIn("/api/analysis/properties/registry/export.xlsx", paths)

    def test_project_and_workspace_scope_aggregate_multiple_sessions(self):
        project_out = self._query(scope="project", project_id=self.project_a, limit=10)
        self.assertEqual(project_out.get("summary", {}).get("sessions_total"), 2)
        self.assertEqual(project_out.get("summary", {}).get("actions_total"), 3)
        self.assertEqual(project_out.get("summary", {}).get("complete"), 2)
        self.assertEqual(project_out.get("summary", {}).get("incomplete"), 1)

        workspace_out = self._query(scope="workspace", workspace_id=self.workspace_id, limit=10)
        self.assertEqual(workspace_out.get("summary", {}).get("projects_total"), 2)
        self.assertEqual(workspace_out.get("summary", {}).get("sessions_total"), 3)
        self.assertEqual(workspace_out.get("summary", {}).get("actions_total"), 4)
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
            filters=self.ProcessPropertiesRegistryFilters(property_types=["Camunda property"], completeness="complete"),
            limit=1,
            offset=0,
        )
        self.assertEqual(filtered.get("summary", {}).get("actions_total"), 2)
        self.assertEqual(filtered.get("page", {}).get("total"), 2)
        self.assertTrue(filtered.get("page", {}).get("has_more"))

        paged = self._query(scope="workspace", workspace_id=self.workspace_id, limit=2, offset=1)
        self.assertEqual(len(paged.get("rows") or []), 2)
        self.assertEqual(paged.get("page", {}).get("total"), 4)
        self.assertTrue(paged.get("page", {}).get("has_more"))

    def test_project_scope_denies_inaccessible_project(self):
        with self.assertRaises(HTTPException) as ctx:
            self.query_process_properties_registry(
                self.ProcessPropertiesRegistryQueryIn(scope="project", project_id=self.project_b),
                self._req(self.viewer),
            )
        self.assertEqual(ctx.exception.status_code, 404)

        visible = self.query_process_properties_registry(
            self.ProcessPropertiesRegistryQueryIn(scope="workspace", workspace_id=self.workspace_id, limit=10),
            self._req(self.viewer),
        )
        self.assertEqual(visible.get("summary", {}).get("projects_total"), 1)
        self.assertEqual({row.get("project_id") for row in visible.get("rows") or []}, {self.project_a})

    def test_csv_export_returns_bom_filename_and_stable_columns(self):
        response = self.export_process_properties_registry_csv(
            self.ProcessPropertiesRegistryQueryIn(scope="workspace", workspace_id=self.workspace_id, limit=10),
            self._req(self.admin),
        )
        self.assertEqual(response.media_type, "text/csv; charset=utf-8")
        disposition = response.headers.get("content-disposition", "")
        self.assertIn("process-properties-workspace-", disposition)
        self.assertIn(".csv", disposition)
        body = bytes(response.body)
        self.assertTrue(body.startswith("\xef\xbb\xbf".encode("latin1")))
        text = body.decode("utf-8-sig")
        parsed = list(csv.reader(io.StringIO(text), delimiter=";"))
        self.assertGreaterEqual(len(parsed), 2)
        self.assertEqual(parsed[0], self.EXPORT_COLUMNS)
        property_names = {row[self.EXPORT_COLUMNS.index("property_name")] for row in parsed[1:]}
        self.assertIn("priority", property_names)
        completeness = {row[self.EXPORT_COLUMNS.index("completeness")] for row in parsed[1:]}
        self.assertIn("complete", completeness)
        self.assertIn("incomplete", completeness)
        self.assertNotIn("<bpmn:definitions>", text)
        self.assertNotIn("heavy report", text)

    def test_csv_export_escapes_semicolons_quotes_and_newlines(self):
        storage = self.get_storage()
        session = storage.load(self.session_a1, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(session)
        session.bpmn_meta["camunda_extensions_by_element_id"]["Task_1"]["properties"]["extensionProperties"][0]["value"] = 'Клаб "XL";\nновый'
        storage.save(session, org_id=self.org_id, is_admin=True)

        response = self.export_process_properties_registry_csv(
            self.ProcessPropertiesRegistryQueryIn(scope="session", session_id=self.session_a1, limit=10),
            self._req(self.admin),
        )
        text = bytes(response.body).decode("utf-8-sig")
        self.assertIn('"Клаб ""XL"";\nновый"', text)
        parsed = list(csv.reader(io.StringIO(text), delimiter=";"))
        value_idx = self.EXPORT_COLUMNS.index("property_value")
        name_idx = self.EXPORT_COLUMNS.index("property_name")
        target_row = next((r for r in parsed[1:] if r[name_idx] == "priority"), None)
        self.assertIsNotNone(target_row)
        self.assertEqual(target_row[value_idx], 'Клаб "XL";\nновый')

    def test_xlsx_export_returns_valid_workbook_with_expected_sheet_and_rows(self):
        response = self.export_process_properties_registry_xlsx(
            self.ProcessPropertiesRegistryQueryIn(scope="project", project_id=self.project_a, limit=10),
            self._req(self.admin),
        )
        self.assertEqual(response.media_type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.assertIn("process-properties-project-", response.headers.get("content-disposition", ""))
        body = bytes(response.body)
        with zipfile.ZipFile(io.BytesIO(body)) as workbook:
            names = set(workbook.namelist())
            self.assertIn("xl/workbook.xml", names)
            self.assertIn("xl/worksheets/sheet1.xml", names)
            workbook_xml = workbook.read("xl/workbook.xml").decode("utf-8")
            sheet_xml = workbook.read("xl/worksheets/sheet1.xml").decode("utf-8")
        self.assertIn('name="Process properties"', workbook_xml)
        self.assertIn("property_name", sheet_xml)
        self.assertIn("priority", sheet_xml)
        self.assertIn("Task_1", sheet_xml)
        self.assertNotIn("<bpmn:definitions>", sheet_xml)
        self.assertNotIn("heavy report", sheet_xml)

    def test_export_filters_and_zero_rows_are_handled(self):
        filtered = self.export_process_properties_registry_csv(
            self.ProcessPropertiesRegistryQueryIn(
                scope="workspace",
                workspace_id=self.workspace_id,
                filters=self.ProcessPropertiesRegistryFilters(property_types=["Camunda listener"]),
                limit=10,
            ),
            self._req(self.admin),
        )
        parsed = list(csv.reader(io.StringIO(bytes(filtered.body).decode("utf-8-sig")), delimiter=";"))
        self.assertEqual(len(parsed), 2)
        self.assertEqual(parsed[1][self.EXPORT_COLUMNS.index("property_type")], "Camunda listener")

        empty = self.export_process_properties_registry_csv(
            self.ProcessPropertiesRegistryQueryIn(
                scope="workspace",
                workspace_id=self.workspace_id,
                filters=self.ProcessPropertiesRegistryFilters(groups=["__missing__"]),
                limit=10,
            ),
            self._req(self.admin),
        )
        parsed_empty = list(csv.reader(io.StringIO(bytes(empty.body).decode("utf-8-sig")), delimiter=";"))
        self.assertEqual(parsed_empty, [self.EXPORT_COLUMNS])

    def test_export_scope_guard_matches_registry_query(self):
        with self.assertRaises(HTTPException) as ctx:
            self.export_process_properties_registry_csv(
                self.ProcessPropertiesRegistryQueryIn(scope="project", project_id=self.project_b),
                self._req(self.viewer),
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_read_only_no_db_writes_during_query(self):
        storage = self.get_storage()
        before = storage.load(self.session_a1, org_id=self.org_id, is_admin=True)
        before_updated = int(before.updated_at or 0)
        before_version = int(before.version or 0)

        out = self._query(scope="session", session_id=self.session_a1, limit=10)
        self.assertTrue(out.get("ok"))

        after = storage.load(self.session_a1, org_id=self.org_id, is_admin=True)
        self.assertEqual(int(after.updated_at or 0), before_updated)
        self.assertEqual(int(after.version or 0), before_version)

    def test_response_envelope_has_all_required_fields(self):
        out = self._query(scope="session", session_id=self.session_a1, limit=10)
        self.assertTrue(out.get("ok"))
        self.assertIn("scope", out)
        self.assertIn("rows", out)
        self.assertIn("summary", out)
        self.assertIn("sessions", out)
        self.assertIn("session_summary", out)
        self.assertIn("page", out)
        self.assertIn("filter_options", out)
        self.assertIn("applied_filters", out)
        self.assertIn("metrics", out)
        self.assertIn("empty_state", out)
        self.assertIn("source_state", out)
        source_state = out.get("source_state") or {}
        self.assertEqual(source_state.get("source"), "process_properties_registry_backend")
        self.assertEqual(source_state.get("namespace"), "/api/analysis/properties/registry")
        self.assertEqual(source_state.get("mutation_allowed"), False)
        self.assertEqual(source_state.get("source_contract_version"), "v1")

    def test_completeness_based_on_property_value(self):
        out = self._query(scope="session", session_id=self.session_a2, limit=10)
        self.assertTrue(out.get("ok"))
        self.assertEqual(len(out.get("rows", [])), 1)
        row = out["rows"][0]
        self.assertEqual(row.get("property_name"), "owner")
        self.assertEqual(row.get("completeness"), "incomplete")
        self.assertEqual(row.get("status"), "Неполная")

    def test_filter_options_reflect_actual_rows(self):
        out = self._query(scope="workspace", workspace_id=self.workspace_id, limit=10)
        self.assertTrue(out.get("ok"))
        filter_options = out.get("filter_options") or {}
        self.assertIn("Camunda property", filter_options.get("property_types", []))
        self.assertIn("Camunda listener", filter_options.get("property_types", []))
        self.assertIn("extensionProperties", filter_options.get("groups", []))
        self.assertIn("extensionListeners", filter_options.get("groups", []))
        self.assertIn("task", filter_options.get("element_types", []))
        self.assertIn("serviceTask", filter_options.get("element_types", []))

    def test_element_type_and_title_populated_from_bpmn_xml(self):
        out = self._query(scope="session", session_id=self.session_a1, limit=10)
        self.assertTrue(out.get("ok"))
        rows = out.get("rows", [])
        self.assertEqual(len(rows), 2)
        for row in rows:
            self.assertEqual(row.get("element_id"), "Task_1")
            self.assertEqual(row.get("element_type"), "task")
            self.assertEqual(row.get("element_title"), "Task One")

    def test_element_type_filter_returns_matching_rows(self):
        out = self._query(
            scope="workspace",
            workspace_id=self.workspace_id,
            filters=self.ProcessPropertiesRegistryFilters(element_types=["task"]),
            limit=10,
        )
        self.assertTrue(out.get("ok"))
        for row in out.get("rows", []):
            self.assertEqual(row.get("element_type"), "task")
        self.assertEqual(out.get("summary", {}).get("actions_total"), 3)

    def test_element_type_filter_non_matching_returns_empty(self):
        out = self._query(
            scope="workspace",
            workspace_id=self.workspace_id,
            filters=self.ProcessPropertiesRegistryFilters(element_types=["nonexistent"]),
            limit=10,
        )
        self.assertTrue(out.get("ok"))
        self.assertEqual(len(out.get("rows", [])), 0)
        self.assertEqual(out.get("summary", {}).get("actions_total"), 0)

    def test_graceful_degradation_when_bpmn_xml_missing(self):
        out = self._query(scope="session", session_id=self.session_a3_empty, limit=10)
        self.assertTrue(out.get("ok"))
        self.assertEqual(len(out.get("rows", [])), 0)


if __name__ == "__main__":
    unittest.main()
