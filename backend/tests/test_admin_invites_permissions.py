import os
import tempfile
import unittest
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str = "", org_memberships: list | None = None, headers: dict | None = None):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.state.org_memberships = list(org_memberships or [])
        self.headers = headers or {}


class AdminInvitesPermissionsTest(unittest.TestCase):
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
        from app.routers.admin import admin_invite_permissions_get, admin_invite_permissions_patch
        from app.schemas.legacy_api import OrgInviteCreateIn
        from app.storage import (
            accept_org_invite,
            create_org_invite,
            create_org_record,
            get_storage,
            list_user_org_memberships,
            upsert_org_membership,
        )

        self.create_user = create_user
        self.admin_invite_permissions_get = admin_invite_permissions_get
        self.admin_invite_permissions_patch = admin_invite_permissions_patch
        self.OrgInviteCreateIn = OrgInviteCreateIn
        self.create_org_invite = create_org_invite
        self.accept_org_invite = accept_org_invite
        self.create_org_record = create_org_record
        self.get_storage = get_storage
        self.list_user_org_memberships = list_user_org_memberships
        self.upsert_org_membership = upsert_org_membership

        org = create_org_record("Test Org Invites", created_by="admin")
        self.org_id = str(org.get("id") or "")
        self.owner = create_user("owner-invites@example.com", "password")
        self.upsert_org_membership(self.org_id, self.owner["id"], "org_owner", None)

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

    def test_create_invite_stores_permissions(self):
        invite = self.create_org_invite(
            self.org_id,
            "newuser@example.com",
            created_by=self.owner["id"],
            role="editor",
            permissions={"create": True, "edit": True, "export": True},
        )
        self.assertTrue(invite.get("permissions"))
        self.assertTrue(invite["permissions"]["create"])
        self.assertTrue(invite["permissions"]["edit"])
        self.assertFalse(invite["permissions"]["delete"])

    def test_accept_invite_copies_permissions_to_membership(self):
        from app.auth import ensure_invited_identity
        invite = self.create_org_invite(
            self.org_id,
            "invited@example.com",
            created_by=self.owner["id"],
            role="editor",
            permissions={"create": True, "edit": True, "export": False, "manage_users": False},
        )
        ensure_invited_identity("invited@example.com")
        accepted = self.accept_org_invite(
            self.org_id,
            invite["invite_key"],
            accepted_by=invite["email"],
            accepted_email=invite["email"],
        )
        self.assertEqual(accepted.get("status"), "used")
        memberships = self.list_user_org_memberships(invite["email"])
        membership = next((m for m in memberships if m.get("org_id") == self.org_id), None)
        self.assertIsNotNone(membership)
        self.assertEqual(membership.get("role"), "editor")
        self.assertTrue(membership["permissions"]["view"])
        self.assertTrue(membership["permissions"]["create"])
        self.assertTrue(membership["permissions"]["edit"])
        self.assertFalse(membership["permissions"]["export"])
        self.assertFalse(membership["permissions"]["manage_users"])

    def test_admin_invite_permission_endpoints_use_membership_keys(self):
        from app.storage import _connect
        now = self.get_storage()._now_ts() if hasattr(self.get_storage(), "_now_ts") else __import__("time").time()
        invite_id = "invite-perms-2"
        with _connect() as con:
            con.execute(
                "INSERT INTO org_invites (id, org_id, email, role, token_hash, expires_at, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (invite_id, self.org_id, "perm@example.com", "editor", "hash", int(now) + 86400, int(now), self.owner["id"]),
            )
            con.commit()

        req = _DummyRequest(self.owner, active_org_id=self.org_id, org_memberships=[{"org_id": self.org_id, "role": "org_owner"}])
        result = self.admin_invite_permissions_patch(req, invite_id, {"create": True, "edit": True})
        body = result.body if hasattr(result, "body") else result
        if isinstance(body, bytes):
            import json
            body = json.loads(body.decode("utf-8"))
        self.assertEqual(body.get("status_code") if isinstance(body, dict) and "status_code" in body else getattr(result, "status_code", 200), 200)

        result = self.admin_invite_permissions_get(req, invite_id)
        body = result.body if hasattr(result, "body") else result
        if isinstance(body, bytes):
            import json
            body = json.loads(body.decode("utf-8"))
        self.assertTrue(body.get("ok"))
        self.assertTrue(body["permissions"]["create"])
        self.assertTrue(body["permissions"]["edit"])


if __name__ == "__main__":
    unittest.main()
