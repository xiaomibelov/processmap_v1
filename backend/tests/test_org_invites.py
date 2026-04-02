import os
import json
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
        self.old_invite_email_enabled = os.environ.get("INVITE_EMAIL_ENABLED")
        self.old_rl_invites = os.environ.get("RL_INVITES_PER_MIN")
        self.old_rl_accept = os.environ.get("RL_ACCEPT_PER_MIN")
        self.old_app_base_url = os.environ.get("APP_BASE_URL")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)
        os.environ["INVITE_EMAIL_ENABLED"] = "0"
        os.environ["RL_INVITES_PER_MIN"] = "50"
        os.environ["RL_ACCEPT_PER_MIN"] = "50"
        os.environ["APP_BASE_URL"] = "https://pm.local"

        from app.auth import create_user
        from app._legacy_main import (
            accept_org_invite_endpoint,
            create_org_invite_endpoint,
            auth_invite_activate,
            auth_invite_preview,
            list_org_invites_endpoint,
            revoke_org_invite_endpoint,
            InviteActivateIn,
            InvitePreviewIn,
            OrgInviteAcceptIn,
            OrgInviteCreateIn,
        )
        from app.storage import get_default_org_id, get_storage
        from app.storage import create_org_record, list_user_org_memberships

        self.create_user = create_user
        self.accept_org_invite_endpoint = accept_org_invite_endpoint
        self.create_org_invite_endpoint = create_org_invite_endpoint
        self.list_org_invites_endpoint = list_org_invites_endpoint
        self.revoke_org_invite_endpoint = revoke_org_invite_endpoint
        self.auth_invite_preview = auth_invite_preview
        self.auth_invite_activate = auth_invite_activate
        self.OrgInviteAcceptIn = OrgInviteAcceptIn
        self.OrgInviteCreateIn = OrgInviteCreateIn
        self.InvitePreviewIn = InvitePreviewIn
        self.InviteActivateIn = InviteActivateIn
        self.get_default_org_id = get_default_org_id
        self.create_org_record = create_org_record
        self.list_user_org_memberships = list_user_org_memberships
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
        if self.old_invite_email_enabled is None:
            os.environ.pop("INVITE_EMAIL_ENABLED", None)
        else:
            os.environ["INVITE_EMAIL_ENABLED"] = self.old_invite_email_enabled
        if self.old_rl_invites is None:
            os.environ.pop("RL_INVITES_PER_MIN", None)
        else:
            os.environ["RL_INVITES_PER_MIN"] = self.old_rl_invites
        if self.old_rl_accept is None:
            os.environ.pop("RL_ACCEPT_PER_MIN", None)
        else:
            os.environ["RL_ACCEPT_PER_MIN"] = self.old_rl_accept
        if self.old_app_base_url is None:
            os.environ.pop("APP_BASE_URL", None)
        else:
            os.environ["APP_BASE_URL"] = self.old_app_base_url
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
            self.OrgInviteCreateIn(email="invite_target@local", full_name="Иван Петров", job_title="Технолог", role="Editor", ttl_days=7),
            req_admin,
        )
        self.assertTrue(isinstance(created, dict))
        invite_key = str(created.get("invite_key") or created.get("invite_token") or "").strip()
        self.assertTrue(invite_key)
        self.assertEqual(str((created.get("invite") or {}).get("status") or ""), "pending")
        self.assertEqual(str((created.get("invite") or {}).get("full_name") or ""), "Иван Петров")
        self.assertEqual(str((created.get("invite") or {}).get("job_title") or ""), "Технолог")

        listed = self.list_org_invites_endpoint(self.default_org_id, req_admin)
        self.assertEqual(int(listed.get("count") or 0), 1)
        self.assertEqual(str((listed.get("items") or [{}])[0].get("status") or ""), "pending")
        self.assertEqual(str((listed.get("current_invite") or {}).get("id") or ""), str((created.get("invite") or {}).get("id") or ""))
        self.assertTrue(str((listed.get("current_invite") or {}).get("invite_link") or "").startswith("https://pm.local/accept-invite?token="))

        req_target = self._mk_req(self.user_ok)
        accepted = self.accept_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteAcceptIn(token=invite_key),
            req_target,
        )
        self.assertTrue(isinstance(accepted, dict))
        self.assertEqual(str((accepted.get("membership") or {}).get("user_id") or ""), str(self.user_ok.get("id") or ""))
        self.assertEqual(str((accepted.get("membership") or {}).get("role") or ""), "editor")
        self.assertEqual(str((accepted.get("invite") or {}).get("status") or ""), "used")

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

    def test_resolve_activate_invite_flow_returns_tokens_and_used_status(self):
        req_admin = self._mk_req(self.admin)
        created = self.create_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteCreateIn(email="invite_new_user@local", full_name="Мария", job_title="Оператор"),
            req_admin,
        )
        invite_key = str(created.get("invite_key") or created.get("invite_token") or "").strip()
        self.assertTrue(invite_key)

        preview = self.auth_invite_preview(self.InvitePreviewIn(invite_key=invite_key), req_admin)
        self.assertTrue(isinstance(preview, dict))
        self.assertEqual(str((preview.get("invite") or {}).get("email") or ""), "invite_new_user@local")
        self.assertEqual(str((preview.get("invite") or {}).get("full_name") or ""), "Мария")
        self.assertEqual(str((preview.get("invite") or {}).get("job_title") or ""), "Оператор")

        activated = self.auth_invite_activate(
            self.InviteActivateIn(invite_key=invite_key, password="strongpass1", password_confirm="strongpass1"),
            req_admin,
        )
        self.assertEqual(int(getattr(activated, "status_code", 0) or 0), 200)
        payload = json.loads(bytes(getattr(activated, "body", b"{}")).decode("utf-8"))
        self.assertTrue(str(payload.get("access_token") or "").strip())
        self.assertEqual(str((payload.get("invite") or {}).get("status") or ""), "used")
        self.assertEqual(str((payload.get("membership") or {}).get("org_id") or ""), self.default_org_id)

    def test_invite_preview_hides_org_for_single_org_mode(self):
        req_admin = self._mk_req(self.admin)
        created = self.create_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteCreateIn(email="invite_preview@local", full_name="Мария", job_title="Оператор"),
            req_admin,
        )
        invite_key = str(created.get("invite_key") or created.get("invite_token") or "").strip()
        preview = self.auth_invite_preview(self.InvitePreviewIn(invite_key=invite_key), req_admin)
        self.assertTrue(bool(preview.get("single_org_mode")))

    def test_accept_invite_grants_membership_only_for_invited_org(self):
        req_admin = self._mk_req(self.admin)
        second_org = self.create_org_record("Test org", created_by=str(self.admin.get("id") or ""))
        self.assertTrue(str(second_org.get("id") or "").strip())

        created = self.create_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteCreateIn(email="invite_target@local", role="Viewer", ttl_days=7),
            req_admin,
        )
        token = str(created.get("invite_token") or created.get("invite_key") or "").strip()
        req_target = self._mk_req(self.user_ok)
        self.accept_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteAcceptIn(token=token),
            req_target,
        )

        memberships = self.list_user_org_memberships(str(self.user_ok.get("id") or ""))
        org_ids = {str(item.get("org_id") or "") for item in memberships}
        self.assertIn(self.default_org_id, org_ids)
        self.assertNotIn(str(second_org.get("id") or ""), org_ids)

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

    def test_accept_expired_invite_returns_410(self):
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
        self.assertEqual(int(getattr(out, "status_code", 0) or 0), 410)

    def test_create_duplicate_invite_without_regenerate_returns_422(self):
        req_admin = self._mk_req(self.admin)
        first = self.create_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteCreateIn(email="invite_target@local", role="Viewer", ttl_days=7),
            req_admin,
        )
        self.assertTrue(isinstance(first, dict))
        second = self.create_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteCreateIn(email="invite_target@local", role="Viewer", ttl_days=7, regenerate=False),
            req_admin,
        )
        self.assertEqual(int(getattr(second, "status_code", 0) or 0), 422)

    def test_regenerate_invite_reissues_and_updates_current_invite(self):
        req_admin = self._mk_req(self.admin)
        first = self.create_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteCreateIn(email="invite_target@local", full_name="Иван", job_title="Оператор", role="Editor", ttl_days=7),
            req_admin,
        )
        first_id = str((first.get("invite") or {}).get("id") or "")
        self.assertTrue(first_id)

        second = self.create_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteCreateIn(email="invite_target@local", full_name="Иван", job_title="Оператор", role="Editor", ttl_days=7, regenerate=True),
            req_admin,
        )
        second_id = str((second.get("invite") or {}).get("id") or "")
        self.assertTrue(second_id)
        self.assertNotEqual(first_id, second_id)

        listed = self.list_org_invites_endpoint(self.default_org_id, req_admin)
        items = listed.get("items") or []
        by_id = {str(row.get("id") or ""): row for row in items if isinstance(row, dict)}
        self.assertEqual(str((by_id.get(first_id) or {}).get("status") or ""), "revoked")
        self.assertEqual(str((by_id.get(second_id) or {}).get("status") or ""), "pending")
        current = listed.get("current_invite") or {}
        self.assertEqual(str(current.get("id") or ""), second_id)
        self.assertTrue(str(current.get("invite_link") or "").startswith("https://pm.local/accept-invite?token="))


if __name__ == "__main__":
    unittest.main()
