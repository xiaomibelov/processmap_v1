import os
import sqlite3
import tempfile
import unittest
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
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.pop("PROCESS_DB_PATH", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        from app.auth import create_user
        from app.routers.product_actions_registry import (
            ProductActionsRegistryFilters,
            ProductActionsRegistryQueryIn,
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
        self.assertEqual(filtered["rows"][0].get("action_type"), "нарезка")

        paged = self._query(scope="workspace", workspace_id=self.workspace_id, limit=1, offset=1)
        self.assertEqual(len(paged.get("rows") or []), 1)
        self.assertEqual(paged.get("page", {}).get("total"), 3)
        self.assertTrue(paged.get("page", {}).get("has_more"))

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


if __name__ == "__main__":
    unittest.main()
