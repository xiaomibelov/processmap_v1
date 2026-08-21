import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str = ""):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class ProjectMembershipScopeTest(unittest.TestCase):
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
        from app._legacy_main import create_org_project, get_org_project, list_projects
        from app.models import CreateProjectIn
        from app.storage import (
            create_org_record,
            get_default_org_id,
            list_user_org_memberships,
            upsert_project_membership,
        )

        self.create_user = create_user
        self.CreateProjectIn = CreateProjectIn
        self.create_org_project = create_org_project
        self.get_org_project = get_org_project
        self.list_projects = list_projects
        self.create_org_record = create_org_record
        self.get_default_org_id = get_default_org_id
        self.list_user_org_memberships = list_user_org_memberships
        self.upsert_project_membership = upsert_project_membership

        self.admin = create_user("scope_admin@local", "admin", is_admin=True)
        self.editor = create_user("scope_editor@local", "editor", is_admin=False)
        self.default_org_id = get_default_org_id()
        self.org_b = create_org_record("Scope B", created_by=str(self.admin.get("id") or ""))

        self._insert_membership(org_id=self.default_org_id, user_id=str(self.admin.get("id") or ""), role="org_admin")
        self._insert_membership(org_id=self.default_org_id, user_id=str(self.editor.get("id") or ""), role="editor")

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

    def _insert_membership(self, *, org_id: str, user_id: str, role: str):
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                """
                INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at)
                VALUES (?, ?, ?, strftime('%s','now'))
                """,
                [org_id, user_id, role],
            )
            con.execute(
                """
                UPDATE org_memberships
                   SET role = ?
                 WHERE org_id = ? AND user_id = ?
                """,
                [role, org_id, user_id],
            )
            con.commit()

    def _mk_req(self, user: dict, org_id: str):
        return _DummyRequest(user, active_org_id=org_id)

    def test_safe_default_without_assignments_user_sees_all_org_projects(self):
        req_admin = self._mk_req(self.admin, self.default_org_id)
        p1 = self.create_org_project(self.default_org_id, self.CreateProjectIn(title="P1", passport={}), req_admin)
        p2 = self.create_org_project(self.default_org_id, self.CreateProjectIn(title="P2", passport={}), req_admin)

        req_editor = self._mk_req(self.editor, self.default_org_id)
        rows = self.list_projects(req_editor)
        ids = {str(item.get("id") or "") for item in rows}
        self.assertIn(str(p1.get("id") or ""), ids)
        self.assertIn(str(p2.get("id") or ""), ids)

    def test_with_assignments_user_is_scoped_to_assigned_projects(self):
        req_admin = self._mk_req(self.admin, self.default_org_id)
        p1 = self.create_org_project(self.default_org_id, self.CreateProjectIn(title="Scoped1", passport={}), req_admin)
        p2 = self.create_org_project(self.default_org_id, self.CreateProjectIn(title="Scoped2", passport={}), req_admin)

        editor_id = str(self.editor.get("id") or "")
        self.upsert_project_membership(self.default_org_id, str(p1.get("id") or ""), editor_id, "viewer")

        req_editor = self._mk_req(self.editor, self.default_org_id)
        rows = self.list_projects(req_editor)
        ids = {str(item.get("id") or "") for item in rows}
        self.assertIn(str(p1.get("id") or ""), ids)
        self.assertNotIn(str(p2.get("id") or ""), ids)

    def test_cross_org_returns_404_for_non_member(self):
        req_admin = self._mk_req(self.admin, str(self.org_b.get("id") or ""))
        pb = self.create_org_project(str(self.org_b.get("id") or ""), self.CreateProjectIn(title="OrgB", passport={}), req_admin)

        req_editor = self._mk_req(self.editor, self.default_org_id)
        out = self.get_org_project(str(self.org_b.get("id") or ""), str(pb.get("id") or ""), req_editor)
        self.assertEqual(getattr(out, "status_code", 0), 404)

    def test_org_admin_override_sees_all_even_if_assignments_exist(self):
        req_admin = self._mk_req(self.admin, self.default_org_id)
        p1 = self.create_org_project(self.default_org_id, self.CreateProjectIn(title="A", passport={}), req_admin)
        p2 = self.create_org_project(self.default_org_id, self.CreateProjectIn(title="B", passport={}), req_admin)

        editor_id = str(self.editor.get("id") or "")
        self.upsert_project_membership(self.default_org_id, str(p1.get("id") or ""), editor_id, "viewer")
        self._insert_membership(org_id=self.default_org_id, user_id=editor_id, role="org_admin")

        req_editor = self._mk_req(self.editor, self.default_org_id)
        rows = self.list_projects(req_editor)
        ids = {str(item.get("id") or "") for item in rows}
        self.assertIn(str(p1.get("id") or ""), ids)
        self.assertIn(str(p2.get("id") or ""), ids)


if __name__ == "__main__":
    unittest.main()
