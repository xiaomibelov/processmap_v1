import os
import sqlite3
import tempfile
import unittest
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str = "", headers: dict | None = None):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = headers or {}


class OrgVisibilityTest(unittest.TestCase):
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
        from app.services.org_workspace import list_org_memberships_payload
        from app.storage import (
            create_org_record,
            get_default_org_id,
            list_user_org_memberships,
            pop_storage_request_scope,
            push_storage_request_scope,
            resolve_active_org_id,
        )

        self.create_user = create_user
        self.create_org_record = create_org_record
        self.get_default_org_id = get_default_org_id
        self.list_user_org_memberships = list_user_org_memberships
        self.resolve_active_org_id = resolve_active_org_id
        self.list_org_memberships_payload = list_org_memberships_payload
        self.push_scope = push_storage_request_scope
        self.pop_scope = pop_storage_request_scope

        self.admin = self.create_user("org_vis_admin@local", "admin", is_admin=True)
        self.editor = self.create_user("org_vis_editor@local", "editor", is_admin=False)
        self.default_org_id = self.get_default_org_id()

        self.org_active = self.create_org_record(
            "Active Org",
            created_by=str(self.admin.get("id") or ""),
        )
        self.org_inactive = self.create_org_record(
            "Inactive Org",
            created_by=str(self.admin.get("id") or ""),
        )
        self._set_org_active(str(self.org_inactive.get("id") or ""), False)

        self._ensure_membership(self.default_org_id, str(self.editor.get("id") or ""), "editor")
        self._ensure_membership(str(self.org_active.get("id") or ""), str(self.editor.get("id") or ""), "editor")
        self._ensure_membership(str(self.org_inactive.get("id") or ""), str(self.editor.get("id") or ""), "editor")

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

    def _ensure_membership(self, org_id: str, user_id: str, role: str):
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

    def _set_org_active(self, org_id: str, is_active: bool):
        with sqlite3.connect(self._db_path()) as con:
            con.execute(
                "UPDATE orgs SET is_active = ? WHERE id = ?",
                [1 if is_active else 0, org_id],
            )
            con.commit()

    def test_non_admin_memberships_include_is_active_flag(self):
        editor_id = str(self.editor.get("id") or "")
        memberships = self.list_user_org_memberships(editor_id, is_admin=False)
        by_org = {str(item.get("org_id") or ""): item for item in memberships}
        self.assertIn(str(self.org_active.get("id") or ""), by_org)
        self.assertIn(str(self.org_inactive.get("id") or ""), by_org)
        self.assertTrue(by_org[str(self.org_active.get("id") or "")].get("is_active"))
        self.assertFalse(by_org[str(self.org_inactive.get("id") or "")].get("is_active"))

    def test_admin_memberships_include_inactive_orgs(self):
        admin_id = str(self.admin.get("id") or "")
        memberships = self.list_user_org_memberships(admin_id, is_admin=True)
        org_ids = {str(item.get("org_id") or "") for item in memberships}
        self.assertIn(str(self.org_active.get("id") or ""), org_ids)
        self.assertIn(str(self.org_inactive.get("id") or ""), org_ids)
        self.assertIn(self.default_org_id, org_ids)

    def test_resolve_active_org_id_fallback_for_non_admin_when_requested_inactive(self):
        editor_id = str(self.editor.get("id") or "")
        inactive_id = str(self.org_inactive.get("id") or "")
        active_id = str(self.org_active.get("id") or "")
        resolved = self.resolve_active_org_id(editor_id, requested_org_id=inactive_id, is_admin=False)
        self.assertNotEqual(resolved, inactive_id)
        self.assertEqual(resolved, self.default_org_id)

    def test_resolve_active_org_id_allows_admin_into_inactive(self):
        admin_id = str(self.admin.get("id") or "")
        inactive_id = str(self.org_inactive.get("id") or "")
        resolved = self.resolve_active_org_id(admin_id, requested_org_id=inactive_id, is_admin=True)
        self.assertEqual(resolved, inactive_id)

    def test_list_org_memberships_payload_excludes_inactive_for_non_admin(self):
        editor_id = str(self.editor.get("id") or "")
        req = _DummyRequest(self.editor, active_org_id=self.default_org_id)
        payload = self.list_org_memberships_payload(req)
        org_ids = {str(item.get("org_id") or "") for item in (payload.get("items") or [])}
        self.assertIn(str(self.org_active.get("id") or ""), org_ids)
        self.assertIn(self.default_org_id, org_ids)
        self.assertNotIn(str(self.org_inactive.get("id") or ""), org_ids)

    def test_list_org_memberships_payload_includes_inactive_for_admin(self):
        admin_id = str(self.admin.get("id") or "")
        req = _DummyRequest(self.admin, active_org_id=self.default_org_id)
        payload = self.list_org_memberships_payload(req)
        org_ids = {str(item.get("org_id") or "") for item in (payload.get("items") or [])}
        self.assertIn(str(self.org_active.get("id") or ""), org_ids)
        self.assertIn(str(self.org_inactive.get("id") or ""), org_ids)
        self.assertIn(self.default_org_id, org_ids)


if __name__ == "__main__":
    unittest.main()
