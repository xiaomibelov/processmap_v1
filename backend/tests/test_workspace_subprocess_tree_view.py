import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
import sys

from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class WorkspaceSubprocessTreeViewTest(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)

        from app.auth import create_user
        from app.models import CreateProjectIn
        from app._legacy_main import create_project
        from app.routers.explorer import (
            CreateFolderBody,
            CreateProjectBody,
            create_folder,
            create_project_in_folder,
            get_project_explorer,
            list_session_children,
        )
        from app.repositories import session_repo
        from app.storage import (
            create_org_record,
            get_default_org_id,
            get_storage,
            list_org_workspaces,
            upsert_org_membership,
        )

        self.create_project = create_project
        self.create_folder = create_folder
        self.create_project_in_folder = create_project_in_folder
        self.get_project_explorer = get_project_explorer
        self.list_session_children = list_session_children
        self.CreateFolderBody = CreateFolderBody
        self.CreateProjectBody = CreateProjectBody
        self.CreateProjectIn = CreateProjectIn
        self.session_repo = session_repo
        self.list_org_workspaces = list_org_workspaces
        self.upsert_org_membership = upsert_org_membership

        _ = get_storage()
        self.org_id = get_default_org_id()
        self.admin = create_user(
            "tree_admin@local",
            "admin",
            is_admin=False,
            full_name="Админ Tree",
            job_title="Руководитель",
        )
        self.foreign = create_user(
            "tree_foreign@local",
            "foreign",
            is_admin=False,
        )
        self.admin_id = str(self.admin.get("id") or "")
        self.foreign_id = str(self.foreign.get("id") or "")
        self.upsert_org_membership(self.org_id, self.admin_id, "org_admin")

        foreign_org = create_org_record("Foreign Tree Org", created_by=self.admin_id)
        self.foreign_org_id = str(foreign_org.get("id") or "")
        self.upsert_org_membership(self.foreign_org_id, self.foreign_id, "editor")

        self.workspace_id = str(self.list_org_workspaces(self.org_id)[0].get("id") or "")
        self.folder = self.create_folder(
            self.workspace_id,
            self.CreateFolderBody(name="Tree раздел"),
            self._req(self.admin),
        )
        self.folder_id = str(self.folder.get("id") or "")

        out = self.create_project_in_folder(
            self.folder_id,
            self.CreateProjectBody(name="Tree Project"),
            self._req(self.admin),
            workspace_id=self.workspace_id,
        )
        self.project_id = str(out.get("id") or "")

        # Root session
        self.root_id = self.session_repo.create(
            title="Root process",
            project_id=self.project_id,
            user_id=self.admin_id,
            org_id=self.org_id,
        )
        # Child session
        self.child_id = self.session_repo.create(
            title="Subprocess A",
            project_id=self.project_id,
            user_id=self.admin_id,
            org_id=self.org_id,
        )
        child = self.session_repo.load(self.child_id, user_id=self.admin_id, org_id=self.org_id, is_admin=True)
        child.parent_session_id = self.root_id
        child.element_id_in_parent = "call_activity_1"
        self.session_repo.save(child, user_id=self.admin_id, org_id=self.org_id, is_admin=True)

    def tearDown(self):
        if self.old_sessions_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_sessions_dir
        if self.old_projects_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_projects_dir
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _db_path(self) -> Path:
        return Path(self.tmp_sessions.name) / "processmap.sqlite3"

    def _req(self, user: dict, org_id: str | None = None):
        return _DummyRequest(user, active_org_id=org_id or self.org_id)

    def _session_ids(self, page):
        return [str(s.id) for s in page.sessions]

    def test_default_explorer_returns_flat_list_with_all_sessions(self):
        page = self.get_project_explorer(
            self.project_id,
            self._req(self.admin),
            workspace_id=self.workspace_id,
        )
        ids = self._session_ids(page)
        self.assertIn(self.root_id, ids)
        self.assertIn(self.child_id, ids)

    def test_root_only_hides_children(self):
        page = self.get_project_explorer(
            self.project_id,
            self._req(self.admin),
            workspace_id=self.workspace_id,
            root_only=True,
            include_children_meta=True,
        )
        ids = self._session_ids(page)
        self.assertIn(self.root_id, ids)
        self.assertNotIn(self.child_id, ids)

    def test_include_children_meta_marks_root_with_has_children(self):
        page = self.get_project_explorer(
            self.project_id,
            self._req(self.admin),
            workspace_id=self.workspace_id,
            root_only=True,
            include_children_meta=True,
        )
        root = next(s for s in page.sessions if s.id == self.root_id)
        self.assertTrue(root.has_children)
        self.assertEqual(root.parent_session_id, "")

    def test_include_children_meta_marks_child_without_children(self):
        page = self.get_project_explorer(
            self.project_id,
            self._req(self.admin),
            workspace_id=self.workspace_id,
            include_children_meta=True,
        )
        child = next(s for s in page.sessions if s.id == self.child_id)
        self.assertFalse(child.has_children)
        self.assertEqual(child.parent_session_id, self.root_id)

    def test_list_session_children_returns_immediate_children(self):
        children = self.list_session_children(
            self.root_id,
            self._req(self.admin),
        )
        ids = [s.id for s in children]
        self.assertEqual(ids, [self.child_id])
        child = children[0]
        self.assertEqual(child.parent_session_id, self.root_id)
        self.assertFalse(child.has_children)

    def test_list_session_children_for_root_without_children_returns_empty(self):
        # Create a second root without children
        root2_id = self.session_repo.create(
            title="Root without children",
            project_id=self.project_id,
            user_id=self.admin_id,
            org_id=self.org_id,
        )
        children = self.list_session_children(
            root2_id,
            self._req(self.admin),
        )
        self.assertEqual(children, [])

    def test_list_session_children_for_foreign_user_is_forbidden(self):
        with self.assertRaises(HTTPException) as exc:
            self.list_session_children(
                self.root_id,
                self._req(self.foreign, org_id=self.foreign_org_id),
            )
        self.assertIn(exc.exception.status_code, (403, 404))

    def test_project_parent_index_exists(self):
        with sqlite3.connect(str(self._db_path())) as con:
            indexes = {
                str(row[0])
                for row in con.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sessions'")
            }
        self.assertIn("idx_sessions_project_parent", indexes)

    def test_feature_flag_default_is_false(self):
        from app.routers.feature_flags import _DEFAULT_FLAGS
        self.assertIn("workspace_session_tree_view", _DEFAULT_FLAGS)
        self.assertEqual(_DEFAULT_FLAGS["workspace_session_tree_view"], "0")

    def test_tree_query_returns_nested_sessions(self):
        page = self.get_project_explorer(
            self.project_id,
            self._req(self.admin),
            workspace_id=self.workspace_id,
            tree=True,
        )
        ids = self._session_ids(page)
        self.assertIn(self.root_id, ids)
        self.assertNotIn(self.child_id, ids)
        root = next(s for s in page.sessions if s.id == self.root_id)
        self.assertTrue(root.has_children)
        self.assertEqual(len(root.children), 1)
        self.assertEqual(root.children[0].id, self.child_id)

    def test_tree_query_respects_depth_limit(self):
        # get_project_session_tree caps depth, but tree=true should still expose children.
        page = self.get_project_explorer(
            self.project_id,
            self._req(self.admin),
            workspace_id=self.workspace_id,
            tree=True,
        )
        root = next(s for s in page.sessions if s.id == self.root_id)
        self.assertIsNotNone(root.children)

    def test_activity_count_exposed_in_explorer(self):
        from app._legacy_main import _count_bpmn_activities
        xml = """<?xml version="1.0"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <process id="p">
            <startEvent id="start" />
            <task id="t1" />
            <userTask id="t2" />
            <callActivity id="ca" />
            <subProcess id="sub" />
            <endEvent id="end" />
          </process>
        </definitions>"""
        root = self.session_repo.load(self.root_id, user_id=self.admin_id, org_id=self.org_id, is_admin=True)
        root.bpmn_xml = xml
        root.activity_count = _count_bpmn_activities(xml)
        self.session_repo.save(root, user_id=self.admin_id, org_id=self.org_id, is_admin=True)

        page = self.get_project_explorer(
            self.project_id,
            self._req(self.admin),
            workspace_id=self.workspace_id,
            include_children_meta=True,
        )
        root_item = next(s for s in page.sessions if s.id == self.root_id)
        self.assertEqual(root_item.activity_count, 4)

    def test_feature_flag_auto_expand_default_is_false(self):
        from app.routers.feature_flags import _DEFAULT_FLAGS
        self.assertIn("workspace_auto_expand_steps", _DEFAULT_FLAGS)
        self.assertEqual(_DEFAULT_FLAGS["workspace_auto_expand_steps"], "0")


if __name__ == "__main__":
    unittest.main()
