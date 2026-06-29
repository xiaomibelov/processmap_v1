import os
import tempfile
import unittest
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str = "", org_memberships: list | None = None):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.state.org_memberships = list(org_memberships or [])
        self.headers = {}


class AdminPermissionsApiTest(unittest.TestCase):
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
        from app.routers.admin import (
            admin_permissions_list,
            admin_permissions_entities,
            admin_permissions_patch,
            admin_permissions_bulk,
            admin_invite_permissions_get,
            admin_invite_permissions_patch,
            AdminPermissionUpdate,
            AdminPermissionBulkBody,
        )
        from app.storage import create_org_record, get_storage, upsert_org_membership, _now_ts

        self.admin_permissions_list = admin_permissions_list
        self.admin_permissions_entities = admin_permissions_entities
        self.admin_permissions_patch = admin_permissions_patch
        self.admin_permissions_bulk = admin_permissions_bulk
        self.admin_invite_permissions_get = admin_invite_permissions_get
        self.admin_invite_permissions_patch = admin_invite_permissions_patch
        self.AdminPermissionUpdate = AdminPermissionUpdate
        self.AdminPermissionBulkBody = AdminPermissionBulkBody
        self.get_storage = get_storage
        self.upsert_org_membership = upsert_org_membership
        self._now_ts = _now_ts

        org = create_org_record("Test Org Perms", created_by="admin")
        self.org_id = str(org.get("id") or "")

        self.admin_user = create_user("admin-perms@example.com", "password", is_admin=True)
        self.owner_user = create_user("owner-perms@example.com", "password")
        self.editor_user = create_user("editor-perms@example.com", "password")
        self.upsert_org_membership(self.org_id, self.owner_user["id"], "org_owner", None)
        self.upsert_org_membership(self.org_id, self.editor_user["id"], "editor", None)

    def tearDown(self):
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()
        if self.old_sessions_dir is not None:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_sessions_dir
        else:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        if self.old_projects_dir is not None:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_projects_dir
        else:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        if self.old_db_path is not None:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        else:
            os.environ.pop("PROCESS_DB_PATH", None)

    def _request(self, user, role=None):
        memberships = []
        if role:
            memberships.append({"org_id": self.org_id, "role": role})
        return _DummyRequest(user, active_org_id=self.org_id, org_memberships=memberships)

    def _body(self, value):
        if isinstance(value, dict):
            return value
        body = getattr(value, "body", None)
        if body is None:
            return {}
        if isinstance(body, bytes):
            import json
            try:
                return json.loads(body.decode("utf-8"))
            except Exception:
                return {}
        return body

    def test_list_permissions_requires_admin_or_owner(self):
        req = self._request(self.editor_user, "editor")
        result = self.admin_permissions_list(req)
        body = self._body(result)
        self.assertEqual(body.get("status_code") if isinstance(body, dict) and "status_code" in body else getattr(result, "status_code", 200), 403)

    def test_list_permissions_returns_defaults_for_owner(self):
        req = self._request(self.owner_user, "org_owner")
        result = self.admin_permissions_list(req)
        body = self._body(result)
        self.assertTrue(body.get("ok"))
        defaults = body.get("defaults", {})
        self.assertIn("users", defaults)
        self.assertTrue(defaults["users"]["org_owner"]["admin"])
        self.assertFalse(defaults["users"]["editor"]["admin"])

    def test_patch_default_permission(self):
        req = self._request(self.owner_user, "org_owner")
        update = self.AdminPermissionUpdate(role="editor", permissions={"view": True, "edit": True, "manage": True})
        result = self.admin_permissions_patch(req, "sessions", "*", update)
        body = self._body(result)
        self.assertTrue(body.get("ok"))
        self.assertTrue(body["item"]["permissions"]["manage"])

    def test_bulk_update_permissions(self):
        req = self._request(self.owner_user, "org_owner")
        bulk = self.AdminPermissionBulkBody(updates=[
            {"entity_type": "folders", "entity_id": "*", "role": "editor", "permissions": {"view": True, "edit": True}},
            {"entity_type": "workspaces", "entity_id": "*", "role": "org_admin", "permissions": {"view": True, "admin": True}},
        ])
        result = self.admin_permissions_bulk(req, bulk)
        body = self._body(result)
        self.assertTrue(body.get("ok"))
        self.assertEqual(len(body.get("updated", [])), 2)

    def test_entities_list_requires_admin_or_owner(self):
        req = self._request(self.editor_user, "editor")
        result = self.admin_permissions_entities(req, "workspaces")
        body = self._body(result)
        self.assertEqual(body.get("status_code") if isinstance(body, dict) and "status_code" in body else getattr(result, "status_code", 200), 403)

    def test_invite_permissions_endpoints(self):
        from app.storage import _connect
        now = self._now_ts()
        invite_id = "invite-perms-1"
        with _connect() as con:
            con.execute(
                "INSERT INTO org_invites (id, org_id, email, role, token_hash, expires_at, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (invite_id, self.org_id, "invitee@example.com", "editor", "hash", now + 86400, now, self.owner_user["id"]),
            )
            con.commit()

        req = self._request(self.owner_user, "org_owner")
        result = self.admin_invite_permissions_get(req, invite_id)
        body = self._body(result)
        self.assertTrue(body.get("ok"))

        patch_req = self._request(self.owner_user, "org_owner")
        result = self.admin_invite_permissions_patch(patch_req, invite_id, {"sessions_view": True, "sessions_edit": True})
        body = self._body(result)
        self.assertEqual(body.get("status_code") if isinstance(body, dict) and "status_code" in body else getattr(result, "status_code", 200), 200)


if __name__ == "__main__":
    unittest.main()
