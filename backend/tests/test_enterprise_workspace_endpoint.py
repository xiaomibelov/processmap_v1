import os
import sqlite3
import tempfile
import unittest
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class EnterpriseWorkspaceEndpointTest(unittest.TestCase):
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
        from app.main import (
            CreateProjectIn,
            CreateSessionIn,
            create_org_project,
            create_org_project_session,
            enterprise_workspace,
        )
        from app.storage import (
            get_default_org_id,
            get_storage,
            push_storage_request_scope,
            pop_storage_request_scope,
            upsert_project_membership,
        )

        self.create_user = create_user
        self.CreateProjectIn = CreateProjectIn
        self.CreateSessionIn = CreateSessionIn
        self.create_org_project = create_org_project
        self.create_org_project_session = create_org_project_session
        self.enterprise_workspace = enterprise_workspace
        self.get_default_org_id = get_default_org_id
        self.get_storage = get_storage
        self.push_scope = push_storage_request_scope
        self.pop_scope = pop_storage_request_scope
        self.upsert_project_membership = upsert_project_membership

        self.admin = create_user("workspace_admin@local", "admin", is_admin=True)
        self.editor = create_user("workspace_editor@local", "editor", is_admin=False)
        _ = get_storage()
        self.org_id = get_default_org_id()
        self._ensure_org_membership(self.org_id, str(self.admin.get("id") or ""), "org_admin")
        self._ensure_org_membership(self.org_id, str(self.editor.get("id") or ""), "editor")

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

    def _db_path(self):
        return os.path.join(self.tmp_sessions.name, "processmap.sqlite3")

    def _ensure_org_membership(self, org_id: str, user_id: str, role: str):
        with sqlite3.connect(self._db_path()) as con:
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

    def _create_project_with_session(self, *, user: dict, project_title: str, session_title: str):
        uid = str(user.get("id") or "")
        request = _DummyRequest(user, active_org_id=self.org_id)
        scope_token = self.push_scope(uid, bool(user.get("is_admin", False)), self.org_id)
        try:
            project = self.create_org_project(
                self.org_id,
                self.CreateProjectIn(title=project_title, passport={}),
                request,
            )
            project_id = str(project.get("id") or "")
            session = self.create_org_project_session(
                self.org_id,
                project_id,
                self.CreateSessionIn(title=session_title, roles=["operator"], start_role="operator"),
                request,
                mode="quick_skeleton",
            )
            session_id = str(session.get("id") or "")
        finally:
            self.pop_scope(scope_token)
        return project_id, session_id

    def test_workspace_returns_filtered_status_and_attention(self):
        admin_id = str(self.admin.get("id") or "")
        req_admin = _DummyRequest(self.admin, active_org_id=self.org_id)
        project_id, session_id = self._create_project_with_session(
            user=self.admin,
            project_title="Workspace Project",
            session_title="Ready Session",
        )
        scope_token = self.push_scope(admin_id, True, self.org_id)
        try:
            st = self.get_storage()
            sess = st.load(session_id, org_id=self.org_id, is_admin=True)
            sess.interview = {
                "needs_attention_count": 2,
                "report_versions": {
                    "primary": [
                        {
                            "id": "rpt_1",
                            "session_id": session_id,
                            "path_id": "primary",
                            "version": 1,
                            "steps_hash": "h1",
                            "created_at": 1,
                            "status": "ok",
                        }
                    ]
                },
            }
            st.save(sess, user_id=admin_id, org_id=self.org_id, is_admin=True)

            payload = self.enterprise_workspace(
                req_admin,
                group_by="projects",
                q="",
                owner_ids="",
                project_id=project_id,
                status="ready",
                updated_from=None,
                updated_to=None,
                needs_attention=1,
                limit=50,
                offset=0,
            )
        finally:
            self.pop_scope(scope_token)
        self.assertIsInstance(payload, dict)
        sessions = payload.get("sessions") or []
        self.assertEqual(len(sessions), 1)
        row = sessions[0]
        self.assertEqual(str(row.get("id") or ""), session_id)
        self.assertEqual(str(row.get("status") or ""), "ready")
        self.assertGreaterEqual(int(row.get("needs_attention") or 0), 1)

    def test_workspace_respects_project_scoped_access(self):
        editor_id = str(self.editor.get("id") or "")
        project_a, _session_a = self._create_project_with_session(
            user=self.admin,
            project_title="Scoped A",
            session_title="A Session",
        )
        _project_b, _session_b = self._create_project_with_session(
            user=self.admin,
            project_title="Scoped B",
            session_title="B Session",
        )
        self.upsert_project_membership(self.org_id, project_a, editor_id, "editor")

        req_editor = _DummyRequest(self.editor, active_org_id=self.org_id)
        scope_token = self.push_scope(editor_id, False, self.org_id)
        try:
            payload = self.enterprise_workspace(
                req_editor,
                group_by="projects",
                q="",
                owner_ids="",
                project_id="",
                status="",
                updated_from=None,
                updated_to=None,
                needs_attention=None,
                limit=50,
                offset=0,
            )
        finally:
            self.pop_scope(scope_token)
        self.assertIsInstance(payload, dict)
        projects = payload.get("projects") or []
        project_ids = {str(item.get("id") or "") for item in projects}
        self.assertEqual(project_ids, {project_a})


if __name__ == "__main__":
    unittest.main()
