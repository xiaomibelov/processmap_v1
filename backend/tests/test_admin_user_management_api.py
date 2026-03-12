import os
import tempfile
import unittest
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str = "", org_memberships: list | None = None):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.state.org_memberships = list(org_memberships or [])
        self.headers = {}


class AdminUserManagementApiTest(unittest.TestCase):
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
        from app.auth import ensure_invited_identity, set_invited_identity_password
        from app.routers.admin import (
            AdminUserCreateBody,
            AdminUserPatchBody,
            admin_orgs,
            admin_create_user,
            admin_patch_user,
            admin_users,
        )
        from app.storage import create_org_invite, create_org_record, get_default_org_id, get_project_storage, get_storage, list_user_org_memberships

        self.create_user = create_user
        self.ensure_invited_identity = ensure_invited_identity
        self.set_invited_identity_password = set_invited_identity_password
        self.AdminUserCreateBody = AdminUserCreateBody
        self.AdminUserPatchBody = AdminUserPatchBody
        self.admin_orgs = admin_orgs
        self.admin_create_user = admin_create_user
        self.admin_patch_user = admin_patch_user
        self.admin_users = admin_users
        self.create_org_invite = create_org_invite
        self.create_org_record = create_org_record
        self.get_default_org_id = get_default_org_id
        self.get_project_storage = get_project_storage
        self.get_storage = get_storage
        self.list_user_org_memberships = list_user_org_memberships

        self.admin = create_user("platform_admin@local", "strongpass1", is_admin=True)
        self.default_org_id = get_default_org_id()
        self.org_b = create_org_record("Second Org", created_by=str(self.admin.get("id") or ""))
        self.org_b_id = str(self.org_b.get("id") or "")
        self.request = _DummyRequest(
            self.admin,
            active_org_id=self.default_org_id,
            org_memberships=self.list_user_org_memberships(str(self.admin.get("id") or ""), is_admin=True),
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

    def test_platform_admin_memberships_cover_all_orgs(self):
        admin_id = str(self.admin.get("id") or "")
        memberships = self.list_user_org_memberships(admin_id, is_admin=True)
        org_ids = {str(item.get("org_id") or "") for item in memberships}
        self.assertIn(self.default_org_id, org_ids)
        self.assertIn(self.org_b_id, org_ids)

    def test_admin_user_create_and_edit_replaces_memberships(self):
        created = self.admin_create_user(
            self.AdminUserCreateBody(
                email="worker@local",
                password="strongpass1",
                memberships=[{"org_id": self.default_org_id, "role": "editor"}],
            ),
            self.request,
        )
        self.assertTrue(bool(created.get("ok")))
        user = created.get("item") or {}
        user_id = str(user.get("id") or "")
        self.assertTrue(user_id)
        self.assertEqual(
            [(item.get("org_id"), item.get("role")) for item in (user.get("memberships") or [])],
            [(self.default_org_id, "editor")],
        )

        patched = self.admin_patch_user(
            user_id,
            self.AdminUserPatchBody(
                is_active=False,
                memberships=[{"org_id": self.org_b_id, "role": "org_admin"}],
            ),
            self.request,
        )
        self.assertTrue(bool(patched.get("ok")))
        updated = patched.get("item") or {}
        self.assertFalse(bool(updated.get("is_active")))
        self.assertEqual(
            [(item.get("org_id"), item.get("role")) for item in (updated.get("memberships") or [])],
            [(self.org_b_id, "org_admin")],
        )

        listed = self.admin_users(self.request)
        rows = listed.get("items") or []
        target = next((row for row in rows if str(row.get("id") or "") == user_id), {})
        self.assertEqual(
            [(item.get("org_id"), item.get("role")) for item in (target.get("memberships") or [])],
            [(self.org_b_id, "org_admin")],
        )

    def test_platform_admin_user_can_be_created_without_explicit_memberships(self):
        created = self.admin_create_user(
            self.AdminUserCreateBody(
                email="global.admin@local",
                password="strongpass1",
                is_admin=True,
                memberships=[],
            ),
            self.request,
        )
        self.assertTrue(bool(created.get("ok")))
        user = created.get("item") or {}
        self.assertTrue(bool(user.get("is_admin")))
        self.assertEqual(user.get("memberships") or [], [])

    def test_invite_created_user_is_listed_in_admin_users(self):
        self.create_org_invite(
            self.org_b_id,
            "invited.user@local",
            created_by=str(self.admin.get("id") or ""),
            full_name="Invited User",
            job_title="Technologist",
            role="editor",
        )
        self.ensure_invited_identity("invited.user@local")
        self.set_invited_identity_password("invited.user@local", "strongpass1")

        listed = self.admin_users(self.request)
        rows = listed.get("items") or []
        target = next((row for row in rows if str(row.get("email") or "") == "invited.user@local"), None)
        self.assertIsNotNone(target)

    def test_admin_orgs_returns_aggregate_columns(self):
        self.admin_create_user(
            self.AdminUserCreateBody(
                email="participant@local",
                password="strongpass1",
                memberships=[{"org_id": self.org_b_id, "role": "editor"}],
            ),
            self.request,
        )
        project_id = self.get_project_storage().create(
            title="QA Project",
            user_id=str(self.admin.get("id") or ""),
            org_id=self.org_b_id,
        )
        self.get_storage().create(
            title="Session A",
            project_id=project_id,
            user_id=str(self.admin.get("id") or ""),
            is_admin=True,
            org_id=self.org_b_id,
        )
        self.create_org_invite(
            self.org_b_id,
            "pending.user@local",
            created_by=str(self.admin.get("id") or ""),
            role="org_viewer",
        )

        payload = self.admin_orgs(self.request)
        self.assertTrue(bool(payload.get("ok")))
        rows = payload.get("items") or []
        target = next((row for row in rows if str(row.get("org_id") or "") == self.org_b_id), {})
        self.assertGreaterEqual(int(target.get("members_count") or 0), 1)
        self.assertEqual(int(target.get("projects_count") or 0), 1)
        self.assertEqual(int(target.get("pending_invites_count") or 0), 1)


if __name__ == "__main__":
    unittest.main()
