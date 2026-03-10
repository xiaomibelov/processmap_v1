import os
import sqlite3
import tempfile
import unittest
from pathlib import Path


class StorageSqliteScopeTest(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)

        from app.storage import (
            get_project_storage,
            get_storage,
            pop_storage_request_scope,
            push_storage_request_scope,
        )

        self.get_storage = get_storage
        self.get_project_storage = get_project_storage
        self.push_scope = push_storage_request_scope
        self.pop_scope = pop_storage_request_scope

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

    def test_projects_and_sessions_are_scoped_by_user(self):
        st = self.get_storage()
        ps = self.get_project_storage()

        t1 = self.push_scope("user_a", False)
        try:
            p1 = ps.create("Project A", {"k": "a"})
            s1 = st.create("Session A", roles=["role_a"], project_id=p1, mode="quick_skeleton")
        finally:
            self.pop_scope(t1)

        t2 = self.push_scope("user_b", False)
        try:
            p2 = ps.create("Project B", {"k": "b"})
            s2 = st.create("Session B", roles=["role_b"], project_id=p2, mode="quick_skeleton")
        finally:
            self.pop_scope(t2)

        t1 = self.push_scope("user_a", False)
        try:
            user_a_projects = ps.list()
            user_a_sessions = st.list(limit=50)
            self.assertEqual(len(user_a_projects), 1)
            self.assertEqual(user_a_projects[0].id, p1)
            self.assertEqual(len(user_a_sessions), 1)
            self.assertEqual(str(user_a_sessions[0].get("id") or ""), s1)
            self.assertIsNone(st.load(s2))
            self.assertIsNone(ps.load(p2))
        finally:
            self.pop_scope(t1)

        t_admin = self.push_scope("admin", True)
        try:
            all_projects = ps.list()
            all_sessions = st.list(limit=50)
            project_ids = {p.id for p in all_projects}
            session_ids = {str(x.get("id") or "") for x in all_sessions}
            self.assertTrue({p1, p2}.issubset(project_ids))
            self.assertTrue({s1, s2}.issubset(session_ids))
        finally:
            self.pop_scope(t_admin)

    def test_default_org_bootstrap_is_idempotent(self):
        from app.auth import create_user
        from app.storage import get_default_org_id, list_user_org_memberships

        st = self.get_storage()
        ps = self.get_project_storage()

        user = create_user("member@local", "memberpass", is_admin=False)
        uid = str(user.get("id") or "").strip()
        default_org_id = get_default_org_id()
        self.assertTrue(default_org_id)

        t_user = self.push_scope(uid, False)
        try:
            pid = ps.create("Project Org Bootstrap", {"k": "v"})
            sid = st.create("Session Org Bootstrap", roles=["role_boot"], project_id=pid, mode="quick_skeleton")
        finally:
            self.pop_scope(t_user)

        memberships_first = list_user_org_memberships(uid, is_admin=False)
        memberships_second = list_user_org_memberships(uid, is_admin=False)
        default_rows = [row for row in memberships_second if str(row.get("org_id") or "") == default_org_id]
        self.assertEqual(len(default_rows), 1)
        self.assertGreaterEqual(len(memberships_first), 1)

        db_path = Path(self.tmp_sessions.name) / "processmap.sqlite3"
        with sqlite3.connect(str(db_path)) as con:
            count = con.execute(
                "SELECT COUNT(*) FROM org_memberships WHERE org_id = ? AND user_id = ?",
                [default_org_id, uid],
            ).fetchone()[0]
            project_org = con.execute("SELECT org_id FROM projects WHERE id = ? LIMIT 1", [pid]).fetchone()[0]
            session_org = con.execute("SELECT org_id FROM sessions WHERE id = ? LIMIT 1", [sid]).fetchone()[0]

        self.assertEqual(int(count or 0), 1)
        self.assertEqual(str(project_org or ""), default_org_id)
        self.assertEqual(str(session_org or ""), default_org_id)


if __name__ == "__main__":
    unittest.main()
