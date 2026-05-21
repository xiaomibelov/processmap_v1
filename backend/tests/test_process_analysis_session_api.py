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


class ProcessAnalysisSessionApiTests(unittest.TestCase):
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
        from app.routers.product_actions_registry import get_session_analysis_view_model
        from app.storage import (
            get_default_org_id,
            get_project_storage,
            get_storage,
            list_org_workspaces,
            upsert_project_membership,
        )

        self.get_session_analysis_view_model = get_session_analysis_view_model
        self.get_storage = get_storage
        self.get_project_storage = get_project_storage
        self.list_org_workspaces = list_org_workspaces
        self.upsert_project_membership = upsert_project_membership

        self.org_id = get_default_org_id()
        self.admin = create_user("session-admin@local", "admin", is_admin=False)
        self.viewer = create_user("session-viewer@local", "viewer", is_admin=False)
        self.admin_id = str(self.admin.get("id") or "")
        self.viewer_id = str(self.viewer.get("id") or "")
        self._insert_membership(self.org_id, self.admin_id, "org_admin")
        self._insert_membership(self.org_id, self.viewer_id, "viewer")

        self.workspace_id = str(self.list_org_workspaces(self.org_id)[0].get("id") or "")
        self.project = self.get_project_storage().create("Session Project", {}, user_id=self.admin_id, org_id=self.org_id, is_admin=True)
        self.upsert_project_membership(self.org_id, self.project, self.viewer_id, "viewer")

        self.session_with_actions = self._seed_session(
            self.project,
            "Session With Actions",
            [
                {
                    "id": "act_1",
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
                },
                {
                    "id": "act_2",
                    "product_group": "Сэндвичи",
                    "product_name": "",
                    "action_type": "упаковка",
                    "action_object": "",
                    "role": "Упаковщик",
                    "step_id": "step_2",
                    "step_label": "Упаковать",
                    "node_id": "Task_2",
                },
                {
                    "id": "act_3",
                    "product_group": "Сэндвичи",
                    "product_name": "Клаб",
                    "action_type": "подача",
                    "action_stage": "выдача",
                    "action_object": "тарелка",
                    "role": "Повар",
                    "step_id": "step_1",
                    "step_label": "Нарезать курицу",
                    "source": "manual",
                },
            ],
            diagram_state_version=7,
            status="in_progress",
            stage="interview",
        )
        self.session_empty = self._seed_session(
            self.project,
            "Session Empty",
            [],
            diagram_state_version=1,
            status="draft",
            stage="",
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

    def _seed_session(self, project_id: str, title: str, product_actions: list, *, diagram_state_version: int, status: str = "draft", stage: str = ""):
        storage = self.get_storage()
        sid = storage.create(title, roles=["role"], project_id=project_id, org_id=self.org_id, is_admin=True)
        session = storage.load(sid, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(session)
        session.interview = {
            "analysis": {"product_actions": product_actions},
            "status": status,
            "stage": stage,
        }
        session.bpmn_xml = '<bpmn:definitions><bpmn:task id="Task_1" name="Task 1"/></bpmn:definitions>'
        session.bpmn_meta = {"drawio": {"svg": "y" * 2000}}
        session.diagram_state_version = diagram_state_version
        storage.save(session, org_id=self.org_id, is_admin=True)
        return sid

    def test_happy_path_returns_unified_envelope(self):
        out = self.get_session_analysis_view_model(self.session_with_actions, self._req(self.admin))
        self.assertTrue(out.get("ok"))
        self.assertEqual(out.get("session_id"), self.session_with_actions)
        self.assertEqual(out.get("session_title"), "Session With Actions")
        self.assertEqual(out.get("project_id"), self.project)
        self.assertEqual(out.get("workspace_id"), self.workspace_id)

        analysis = out.get("analysis", {})
        product_actions = analysis.get("product_actions", {})
        self.assertEqual(len(product_actions.get("rows", [])), 3)
        self.assertEqual(product_actions.get("summary", {}).get("total"), 3)
        self.assertEqual(product_actions.get("summary", {}).get("complete"), 2)
        self.assertEqual(product_actions.get("summary", {}).get("incomplete"), 1)
        self.assertEqual(product_actions.get("metrics", {}).get("total_rows"), 3)
        self.assertEqual(product_actions.get("metrics", {}).get("complete"), 2)
        self.assertEqual(product_actions.get("metrics", {}).get("incomplete"), 1)
        self.assertEqual(product_actions.get("empty_state", {}).get("kind"), "not_empty")
        self.assertEqual(product_actions.get("empty_state", {}).get("scope"), "session")
        self.assertEqual(product_actions.get("source_state", {}).get("source"), "process_analysis_session_view_model")
        self.assertTrue(product_actions.get("source_state", {}).get("interview_loaded"))
        self.assertTrue(product_actions.get("applied_filters", {}) == {})

        filter_options = product_actions.get("filter_options", {})
        self.assertIn("Сэндвичи", filter_options.get("product_groups", []))
        self.assertIn("Клаб", filter_options.get("products", []))
        self.assertIn("нарезка", filter_options.get("action_types", []))
        self.assertIn("подготовка", filter_options.get("stages", []))
        self.assertIn("ингредиент", filter_options.get("object_categories", []))
        self.assertIn("Повар", filter_options.get("roles", []))

        derived = analysis.get("derived", {})
        step_counts = derived.get("step_action_counts", {})
        self.assertEqual(step_counts.get("step_1"), 2)
        self.assertEqual(step_counts.get("step_2"), 1)

        interview_state = out.get("interview_state", {})
        self.assertEqual(interview_state.get("status"), "in_progress")
        self.assertEqual(interview_state.get("stage"), "interview")
        self.assertGreater(interview_state.get("updated_at", 0), 0)

    def test_empty_analysis_returns_empty_envelope(self):
        out = self.get_session_analysis_view_model(self.session_empty, self._req(self.admin))
        self.assertTrue(out.get("ok"))
        product_actions = out.get("analysis", {}).get("product_actions", {})
        self.assertEqual(product_actions.get("rows", []), [])
        self.assertEqual(product_actions.get("summary", {}).get("total"), 0)
        self.assertEqual(product_actions.get("summary", {}).get("complete"), 0)
        self.assertEqual(product_actions.get("summary", {}).get("incomplete"), 0)
        self.assertEqual(product_actions.get("empty_state", {}).get("kind"), "no_actions")
        self.assertEqual(product_actions.get("metrics", {}).get("total_rows"), 0)
        self.assertEqual(product_actions.get("derived", {}).get("step_action_counts", {}), {})

    def test_404_for_missing_session(self):
        with self.assertRaises(HTTPException) as ctx:
            self.get_session_analysis_view_model("nonexistent", self._req(self.admin))
        self.assertEqual(ctx.exception.status_code, 404)

    def test_viewer_can_access_allowed_session(self):
        out = self.get_session_analysis_view_model(self.session_with_actions, self._req(self.viewer))
        self.assertTrue(out.get("ok"))
        self.assertEqual(len(out.get("analysis", {}).get("product_actions", {}).get("rows", [])), 3)

    def test_step_action_counts_correctness(self):
        out = self.get_session_analysis_view_model(self.session_with_actions, self._req(self.admin))
        counts = out.get("analysis", {}).get("derived", {}).get("step_action_counts", {})
        self.assertEqual(len(counts), 2)
        self.assertEqual(counts["step_1"], 2)
        self.assertEqual(counts["step_2"], 1)

    def test_no_heavy_payload_in_response(self):
        out = self.get_session_analysis_view_model(self.session_with_actions, self._req(self.admin))
        for heavy_key in ("bpmn_xml", "interview", "interview_json", "bpmn_meta", "report_versions"):
            self.assertNotIn(heavy_key, out)
            for row in out.get("analysis", {}).get("product_actions", {}).get("rows", []):
                self.assertNotIn(heavy_key, row)


if __name__ == "__main__":
    unittest.main()
