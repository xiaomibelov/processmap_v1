import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str = "", ip: str = "127.0.0.1"):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {"x-forwarded-for": ip}


class OrgInvitesEmailFlowTest(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")

        self.old_invite_email_enabled = os.environ.get("INVITE_EMAIL_ENABLED")
        self.old_invite_ttl_hours = os.environ.get("INVITE_TTL_HOURS")
        self.old_smtp_host = os.environ.get("SMTP_HOST")
        self.old_smtp_port = os.environ.get("SMTP_PORT")
        self.old_smtp_from = os.environ.get("SMTP_FROM")
        self.old_app_base_url = os.environ.get("APP_BASE_URL")
        self.old_rl_invites = os.environ.get("RL_INVITES_PER_MIN")
        self.old_rl_accept = os.environ.get("RL_ACCEPT_PER_MIN")

        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)

        os.environ["INVITE_EMAIL_ENABLED"] = "1"
        os.environ["INVITE_TTL_HOURS"] = "72"
        os.environ["SMTP_HOST"] = "smtp.local"
        os.environ["SMTP_PORT"] = "587"
        os.environ["SMTP_FROM"] = "noreply@local"
        os.environ["APP_BASE_URL"] = "https://pm.local"
        os.environ["RL_INVITES_PER_MIN"] = "20"
        os.environ["RL_ACCEPT_PER_MIN"] = "30"

        from app.auth import create_user
        from app._legacy_main import (
            OrgInviteAcceptIn,
            OrgInviteCreateIn,
            accept_org_invite_endpoint,
            create_org_invite_endpoint,
        )
        import app._legacy_main as main_mod
        from app.storage import get_default_org_id, get_storage

        self.create_user = create_user
        self.OrgInviteCreateIn = OrgInviteCreateIn
        self.OrgInviteAcceptIn = OrgInviteAcceptIn
        self.create_org_invite_endpoint = create_org_invite_endpoint
        self.accept_org_invite_endpoint = accept_org_invite_endpoint
        self.main_mod = main_mod
        self.get_default_org_id = get_default_org_id
        _ = get_storage()

        self.main_mod._RATE_LIMIT_BUCKETS.clear()

        self.admin = create_user("invite_email_admin@local", "admin", is_admin=True)
        self.user_ok = create_user("invite_email_target@local", "target", is_admin=False)
        self.default_org_id = get_default_org_id()

        self._insert_membership(self.default_org_id, str(self.admin.get("id") or ""), "org_admin")
        self._insert_membership(self.default_org_id, str(self.user_ok.get("id") or ""), "viewer")

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

        for key, old in [
            ("INVITE_EMAIL_ENABLED", self.old_invite_email_enabled),
            ("INVITE_TTL_HOURS", self.old_invite_ttl_hours),
            ("SMTP_HOST", self.old_smtp_host),
            ("SMTP_PORT", self.old_smtp_port),
            ("SMTP_FROM", self.old_smtp_from),
            ("APP_BASE_URL", self.old_app_base_url),
            ("RL_INVITES_PER_MIN", self.old_rl_invites),
            ("RL_ACCEPT_PER_MIN", self.old_rl_accept),
        ]:
            if old is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old

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

    def _mk_req(self, user: dict, *, ip: str = "127.0.0.1"):
        return _DummyRequest(user, active_org_id=self.default_org_id, ip=ip)

    def test_create_invite_email_enabled_sends_email_and_hides_token(self):
        calls = []

        def _fake_send_email(**kwargs):
            calls.append(kwargs)

        prev_send = self.main_mod._send_org_invite_email
        self.main_mod._send_org_invite_email = _fake_send_email
        try:
            req_admin = self._mk_req(self.admin, ip="10.0.0.8")
            created = self.create_org_invite_endpoint(
                self.default_org_id,
                self.OrgInviteCreateIn(email="invite_email_target@local", full_name="Тестовый пользователь", job_title="Инженер", role="Editor", ttl_days=7),
                req_admin,
            )
            self.assertTrue(isinstance(created, dict))
            self.assertEqual(str(created.get("delivery") or ""), "email")
            self.assertEqual(str(created.get("invite_token") or ""), "")
            self.assertEqual(str(created.get("invite_key") or ""), "")
            self.assertEqual(len(calls), 1)
            self.assertEqual(str(calls[0].get("to_email") or ""), "invite_email_target@local")
            self.assertTrue(str(calls[0].get("invite_link") or "").startswith("https://pm.local/accept-invite?token="))
        finally:
            self.main_mod._send_org_invite_email = prev_send

    def test_accept_expired_invite_returns_410(self):
        os.environ["INVITE_EMAIL_ENABLED"] = "0"
        self.main_mod._RATE_LIMIT_BUCKETS.clear()

        req_admin = self._mk_req(self.admin, ip="10.0.0.9")
        created = self.create_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteCreateIn(email="invite_email_target@local", role="Viewer", ttl_days=1),
            req_admin,
        )
        token = str(created.get("invite_token") or "").strip()
        invite_id = str((created.get("invite") or {}).get("id") or "").strip()
        self.assertTrue(token)
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute("UPDATE org_invites SET expires_at = strftime('%s','now') - 10 WHERE id = ?", [invite_id])
            con.commit()

        req_target = self._mk_req(self.user_ok, ip="10.0.0.10")
        out = self.accept_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteAcceptIn(token=token),
            req_target,
        )
        self.assertEqual(int(getattr(out, "status_code", 0) or 0), 410)

    def test_rate_limit_on_invite_create_returns_429(self):
        os.environ["INVITE_EMAIL_ENABLED"] = "0"
        os.environ["RL_INVITES_PER_MIN"] = "1"
        self.main_mod._RATE_LIMIT_BUCKETS.clear()

        req_admin = self._mk_req(self.admin, ip="10.0.0.11")
        first = self.create_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteCreateIn(email="rl_first@local", role="Viewer", ttl_days=1),
            req_admin,
        )
        self.assertTrue(isinstance(first, dict))

        second = self.create_org_invite_endpoint(
            self.default_org_id,
            self.OrgInviteCreateIn(email="rl_second@local", role="Viewer", ttl_days=1),
            req_admin,
        )
        self.assertEqual(int(getattr(second, "status_code", 0) or 0), 429)


if __name__ == "__main__":
    unittest.main()
