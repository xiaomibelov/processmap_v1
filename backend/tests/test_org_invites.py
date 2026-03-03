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


class OrgInvitesApiTest(unittest.TestCase):
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
            accept_org_invite_endpoint,
            create_org_invite_endpoint,
            list_org_invites_endpoint,
            revoke_org_invite_endpoint,
            OrgInviteAcceptIn,
            OrgInviteCreateIn,
        )
        from app.storage import get_default_org_id, get_storage

        self.create_user = create_user
        self.accept_org_invite_endpoint = accept_org_invite_endpoint
        self.create_org_invite_endpoint = create_org_invite_endpoint
        self.list_org_invites_endpoint = list_org_invites_endpoint
        self.revoke_org_invite_endpoint = revoke_org_invite_endpoint
        self.OrgInviteAcceptIn = OrgInviteAcceptIn
        self.OrgInviteCreateIn = OrgInviteCreateIn
        self.get_default_org_id = get_default_org_id
        _ = get_storage()

        self.admin = create_user("invite_admin@local", "admin", is_admin=True)
        self.user_ok = create_user("invite_target@local", "target", is_admin=False)
        self.user_other = create_user("invite_other@local", "other", is_admin=False)
        self.default_org_id = get_default_org_id()

        self._insert_membership(self.default_org_id, str(self.admin.get("id") or ""), "org_admin")
        self._insert_membership(self.default_org_id, str(self.user_ok.get("id") or ""), "viewer")
        self._insert_membership(self.default_org_id, str(self.user_other.get("id") or ""), "viewer")

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

    def _insert_membership(self, org_id: str, user_id: str, role: str):
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

    def _mk_req(self, user: dict):
        return _DummyRequest(user, active_org_id=self.default_org_id)

    def test_create_list_accept_invite_success(self):
        req_admin = self._mk_req(self.admin)
        created = self.create_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteCreateIn(email="invite_target@local", role="Editor", ttl_days=7),
            req_admin,
        )
        self.assertTrue(isinstance(created, dict))
        token = str(created.get("invite_token") or "").strip()
        self.assertTrue(token)

        listed = self.list_org_invites_endpoint(self.default_org_id, req_admin)
        self.assertEqual(int(listed.get("count") or 0), 1)

        req_target = self._mk_req(self.user_ok)
        accepted = self.accept_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteAcceptIn(token=token),
            req_target,
        )
        self.assertTrue(isinstance(accepted, dict))
        self.assertEqual(str((accepted.get("membership") or {}).get("user_id") or ""), str(self.user_ok.get("id") or ""))
        self.assertEqual(str((accepted.get("membership") or {}).get("role") or ""), "editor")

    def test_accept_invite_email_mismatch_returns_409(self):
        req_admin = self._mk_req(self.admin)
        created = self.create_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteCreateIn(email="invite_target@local", role="Viewer", ttl_days=7),
            req_admin,
        )
        token = str(created.get("invite_token") or "").strip()

        req_other = self._mk_req(self.user_other)
        out = self.accept_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteAcceptIn(token=token),
            req_other,
        )
        self.assertEqual(int(getattr(out, "status_code", 0) or 0), 409)

    def test_revoke_invite(self):
        req_admin = self._mk_req(self.admin)
        created = self.create_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteCreateIn(email="invite_target@local", role="Viewer", ttl_days=7),
            req_admin,
        )
        invite_id = str((created.get("invite") or {}).get("id") or "").strip()
        self.assertTrue(invite_id)
        resp = self.revoke_org_invite_endpoint(self.default_org_id, invite_id, req_admin)
        self.assertEqual(int(getattr(resp, "status_code", 0) or 0), 204)

    def test_accept_expired_invite_returns_409(self):
        req_admin = self._mk_req(self.admin)
        created = self.create_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteCreateIn(email="invite_target@local", role="Viewer", ttl_days=1),
            req_admin,
        )
        token = str(created.get("invite_token") or "").strip()
        invite_id = str((created.get("invite") or {}).get("id") or "").strip()
        self.assertTrue(token)
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute("UPDATE org_invites SET expires_at = strftime('%s','now') - 10 WHERE id = ?", [invite_id])
            con.commit()

        req_target = self._mk_req(self.user_ok)
        out = self.accept_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteAcceptIn(token=token),
            req_target,
        )
        self.assertEqual(int(getattr(out, "status_code", 0) or 0), 409)


if __name__ == "__main__":
    unittest.main()
