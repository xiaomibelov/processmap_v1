import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str = "", headers: dict | None = None):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = headers or {}


class EnterpriseOrgScopeApiTest(unittest.TestCase):
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
        from app._legacy_main import AuthMeOut, auth_me, create_org_project, list_projects
        from app.models import CreateProjectIn
        from app.routers.org_members import list_org_members_endpoint
        from app.storage import (
            create_org_record,
            get_default_org_id,
            list_user_org_memberships,
            pop_storage_request_scope,
            push_storage_request_scope,
        )

        self.AuthMeOut = AuthMeOut
        self.CreateProjectIn = CreateProjectIn
        self.auth_me = auth_me
        self.create_org_project = create_org_project
        self.list_projects = list_projects
        self.list_org_members_endpoint = list_org_members_endpoint
        self.create_org_record = create_org_record
        self.get_default_org_id = get_default_org_id
        self.list_user_org_memberships = list_user_org_memberships
        self.push_scope = push_storage_request_scope
        self.pop_scope = pop_storage_request_scope

        self.admin_user = create_user("ent_admin@local", "adminpass", is_admin=True)
        self.editor_user = create_user("ent_editor@local", "editorpass", is_admin=False)
        self.default_org_id = get_default_org_id()
        self.org_b = create_org_record("Second Org", created_by=str(self.admin_user.get("id") or ""))

        self._insert_membership(
            org_id=self.default_org_id,
            user_id=str(self.admin_user.get("id") or ""),
            role="org_admin",
        )
        self._insert_membership(
            org_id=self.default_org_id,
            user_id=str(self.editor_user.get("id") or ""),
            role="editor",
        )

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
        now = 0
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                """
                INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at)
                VALUES (?, ?, ?, COALESCE(?, strftime('%s','now')))
                """,
                [org_id, user_id, role, now],
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

    def test_auth_me_returns_org_memberships_and_active_org(self):
        uid = str(self.admin_user.get("id") or "")
        req = _DummyRequest(
            self.admin_user,
            headers={"x-org-id": str(self.org_b.get("id") or "")},
        )
        payload = self.auth_me(req)
        parsed = self.AuthMeOut.model_validate(payload)
        org_ids = {str(item.get("org_id") or "") for item in parsed.orgs}
        self.assertEqual(parsed.id, uid)
        self.assertTrue(parsed.default_org_id)
        self.assertTrue(parsed.active_org_id)
        self.assertIn(parsed.default_org_id, org_ids)
        self.assertIn(str(self.org_b.get("id") or ""), org_ids)

    def test_enterprise_endpoint_returns_404_for_non_member(self):
        oid = str(self.org_b.get("id") or "")
        req = _DummyRequest(self.editor_user, active_org_id=self.default_org_id)
        t_editor = self.push_scope(str(self.editor_user.get("id") or ""), False, self.default_org_id)
        try:
            out = self.create_org_project(oid, self.CreateProjectIn(title="Blocked", passport={}), req)
        finally:
            self.pop_scope(t_editor)
        self.assertEqual(int(getattr(out, "status_code", 0) or 0), 404)

    def test_legacy_projects_are_scoped_by_active_org(self):
        oid = str(self.org_b.get("id") or "")
        admin_id = str(self.admin_user.get("id") or "")
        self._insert_membership(org_id=oid, user_id=admin_id, role="org_admin")

        req = _DummyRequest(self.admin_user, active_org_id=oid)
        t_org_b = self.push_scope(admin_id, True, oid)
        try:
            created = self.create_org_project(oid, self.CreateProjectIn(title="OrgB Project", passport={}), req)
            created_b_id = str(created.get("id") or "")
        finally:
            self.pop_scope(t_org_b)

        req_default = _DummyRequest(self.admin_user, active_org_id=self.default_org_id)
        t_default = self.push_scope(admin_id, True, self.default_org_id)
        try:
            default_created = self.create_org_project(
                self.default_org_id,
                self.CreateProjectIn(title="Default Project", passport={}),
                req_default,
            )
            default_project_id = str(default_created.get("id") or "")
            default_list = self.list_projects()
        finally:
            self.pop_scope(t_default)

        t_org_b_list = self.push_scope(admin_id, True, oid)
        try:
            org_b_list = self.list_projects()
        finally:
            self.pop_scope(t_org_b_list)

        default_ids = {str(item.get("id") or "") for item in (default_list or [])}
        org_b_ids = {str(item.get("id") or "") for item in (org_b_list or [])}
        self.assertIn(default_project_id, default_ids)
        self.assertNotIn(created_b_id, default_ids)
        self.assertIn(created_b_id, org_b_ids)

    def test_org_members_route_returns_members_with_email(self):
        req = _DummyRequest(self.admin_user, active_org_id=self.default_org_id)
        payload = self.list_org_members_endpoint(self.default_org_id, req)
        self.assertIsInstance(payload, dict)
        self.assertEqual(int(payload.get("count") or 0), 2)
        rows = payload.get("items") or []
        emails = {str(item.get("email") or "") for item in rows}
        self.assertIn("ent_admin@local", emails)
        self.assertIn("ent_editor@local", emails)


if __name__ == "__main__":
    unittest.main()
