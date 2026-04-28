import os
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
import sys

from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict | None, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user or {}, active_org_id=active_org_id)
        self.headers = {}


class SessionPresenceApiTests(unittest.TestCase):
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
        from app._legacy_main import SessionPresenceTouchIn, leave_session_presence_api, touch_session_presence_api
        from app.storage import (
            SESSION_PRESENCE_TTL_SECONDS,
            create_org_record,
            get_default_org_id,
            get_project_storage,
            get_storage,
            leave_session_presence,
            list_session_presence,
            touch_session_presence,
            upsert_org_membership,
            upsert_project_membership,
        )

        self.SessionPresenceTouchIn = SessionPresenceTouchIn
        self.SESSION_PRESENCE_TTL_SECONDS = SESSION_PRESENCE_TTL_SECONDS
        self.leave_session_presence_api = leave_session_presence_api
        self.touch_session_presence_api = touch_session_presence_api
        self.get_default_org_id = get_default_org_id
        self.get_project_storage = get_project_storage
        self.get_storage = get_storage
        self.create_org_record = create_org_record
        self.leave_session_presence = leave_session_presence
        self.list_session_presence = list_session_presence
        self.touch_session_presence = touch_session_presence
        self.upsert_org_membership = upsert_org_membership
        self.upsert_project_membership = upsert_project_membership

        self.org_id = get_default_org_id()
        self.user_a = create_user(
            "presence_a@local",
            "strongpass",
            is_admin=False,
            full_name="Иван Петров",
            job_title="Аналитик",
        )
        self.user_b = create_user(
            "presence_b@local",
            "strongpass",
            is_admin=False,
            full_name="Анна Смирнова",
            job_title="Технолог",
        )
        self.upsert_org_membership(self.org_id, str(self.user_a.get("id") or ""), "editor")
        self.upsert_org_membership(self.org_id, str(self.user_b.get("id") or ""), "editor")

        ps = get_project_storage()
        self.project_id = ps.create(
            "Presence Project",
            {},
            user_id=str(self.user_a.get("id") or ""),
            org_id=self.org_id,
            is_admin=True,
        )
        st = get_storage()
        self.session_id = st.create(
            title="Presence Session",
            roles=["owner"],
            project_id=self.project_id,
            user_id=str(self.user_a.get("id") or ""),
            org_id=self.org_id,
            is_admin=True,
        )
        self.upsert_project_membership(self.org_id, self.project_id, str(self.user_a.get("id") or ""), "editor")
        self.upsert_project_membership(self.org_id, self.project_id, str(self.user_b.get("id") or ""), "viewer")

        foreign_org = self.create_org_record("Presence Foreign Org", created_by=str(self.user_a.get("id") or ""))
        self.foreign_org_id = str(foreign_org.get("id") or "")

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

    def _req(self, user: dict | None, org_id: str | None = None):
        return _DummyRequest(user, active_org_id=org_id or self.org_id)

    def _body(self, client_id: str, surface: str = "process_stage"):
        return self.SessionPresenceTouchIn(client_id=client_id, surface=surface)

    def test_authenticated_user_can_touch_presence_for_accessible_session(self):
        out = self.touch_session_presence_api(
            self.session_id,
            self._body("tab_a"),
            request=self._req(self.user_a),
        )

        self.assertEqual(out.get("ok"), True)
        self.assertEqual(out.get("session_id"), self.session_id)
        self.assertEqual(out.get("ttl_seconds"), 60)
        users = out.get("active_users") or []
        self.assertEqual(len(users), 1)
        self.assertEqual(users[0].get("display_name"), "Иван Петров")
        self.assertEqual(users[0].get("email"), "presence_a@local")
        self.assertEqual(users[0].get("job_title"), "Аналитик")
        self.assertNotIn("password_hash", users[0])
        self.assertEqual(users[0].get("is_current_user"), True)

    def test_unauthenticated_and_wrong_org_requests_are_rejected(self):
        with self.assertRaises(HTTPException) as unauth:
            self.touch_session_presence_api(
                self.session_id,
                self._body("tab_a"),
                request=self._req(None),
            )
        self.assertEqual(unauth.exception.status_code, 401)

        with self.assertRaises(HTTPException) as wrong_org:
            self.touch_session_presence_api(
                self.session_id,
                self._body("tab_a"),
                request=self._req(self.user_a, self.foreign_org_id),
            )
        self.assertEqual(wrong_org.exception.status_code, 404)

    def test_presence_groups_multiple_clients_and_filters_stale_users(self):
        now = 200000
        user_a_id = str(self.user_a.get("id") or "")
        user_b_id = str(self.user_b.get("id") or "")
        self.touch_session_presence(
            self.session_id,
            user_a_id,
            "tab_a_1",
            org_id=self.org_id,
            project_id=self.project_id,
            now_ts=now,
        )
        self.touch_session_presence(
            self.session_id,
            user_a_id,
            "tab_a_2",
            org_id=self.org_id,
            project_id=self.project_id,
            now_ts=now + 5,
        )
        self.touch_session_presence(
            self.session_id,
            user_b_id,
            "tab_b_old",
            org_id=self.org_id,
            project_id=self.project_id,
            now_ts=now - 500,
        )

        users = self.list_session_presence(
            self.session_id,
            org_id=self.org_id,
            project_id=self.project_id,
            ttl_seconds=self.SESSION_PRESENCE_TTL_SECONDS,
            now_ts=now + 10,
            current_user_id=user_a_id,
        )

        self.assertEqual([item.get("user_id") for item in users], [user_a_id])
        self.assertEqual(users[0].get("last_seen_at"), now + 5)

    def test_presence_does_not_leak_cross_session_or_cross_org_rows(self):
        st = self.get_storage()
        other_session_id = st.create(
            title="Other Presence Session",
            roles=["owner"],
            project_id=self.project_id,
            user_id=str(self.user_a.get("id") or ""),
            org_id=self.org_id,
            is_admin=True,
        )
        user_b_id = str(self.user_b.get("id") or "")
        self.touch_session_presence(
            other_session_id,
            user_b_id,
            "tab_b",
            org_id=self.org_id,
            project_id=self.project_id,
            now_ts=300000,
        )
        self.touch_session_presence(
            self.session_id,
            user_b_id,
            "tab_b_foreign",
            org_id=self.foreign_org_id,
            project_id=self.project_id,
            now_ts=300000,
        )

        users = self.list_session_presence(
            self.session_id,
            org_id=self.org_id,
            project_id=self.project_id,
            ttl_seconds=self.SESSION_PRESENCE_TTL_SECONDS,
            now_ts=300010,
        )
        self.assertEqual(users, [])

    def test_presence_default_ttl_excludes_users_inactive_over_sixty_seconds(self):
        now = 400000
        user_a_id = str(self.user_a.get("id") or "")
        user_b_id = str(self.user_b.get("id") or "")
        self.touch_session_presence(
            self.session_id,
            user_a_id,
            "tab_a",
            org_id=self.org_id,
            project_id=self.project_id,
            now_ts=now,
        )
        self.touch_session_presence(
            self.session_id,
            user_b_id,
            "tab_b_stale",
            org_id=self.org_id,
            project_id=self.project_id,
            now_ts=now - 61,
        )

        users = self.list_session_presence(
            self.session_id,
            org_id=self.org_id,
            project_id=self.project_id,
            now_ts=now,
        )

        self.assertEqual([item.get("user_id") for item in users], [user_a_id])

    def test_leave_presence_removes_only_current_client(self):
        now = int(time.time())
        user_a_id = str(self.user_a.get("id") or "")
        user_b_id = str(self.user_b.get("id") or "")
        self.touch_session_presence(
            self.session_id,
            user_a_id,
            "tab_a_1",
            org_id=self.org_id,
            project_id=self.project_id,
            now_ts=now,
        )
        self.touch_session_presence(
            self.session_id,
            user_a_id,
            "tab_a_2",
            org_id=self.org_id,
            project_id=self.project_id,
            now_ts=now,
        )
        self.touch_session_presence(
            self.session_id,
            user_b_id,
            "tab_b",
            org_id=self.org_id,
            project_id=self.project_id,
            now_ts=now,
        )

        out = self.leave_session_presence_api(
            self.session_id,
            self._body("tab_a_1"),
            request=self._req(self.user_a),
        )

        self.assertEqual(out.get("ok"), True)
        self.assertEqual(out.get("removed"), 1)
        users = self.list_session_presence(
            self.session_id,
            org_id=self.org_id,
            project_id=self.project_id,
            now_ts=now,
            current_user_id=user_a_id,
        )
        self.assertEqual({item.get("user_id") for item in users}, {user_a_id, user_b_id})

    def test_storage_leave_presence_does_not_cross_session_or_org(self):
        st = self.get_storage()
        other_session_id = st.create(
            title="Other Leave Session",
            roles=["owner"],
            project_id=self.project_id,
            user_id=str(self.user_a.get("id") or ""),
            org_id=self.org_id,
            is_admin=True,
        )
        user_a_id = str(self.user_a.get("id") or "")
        self.touch_session_presence(
            self.session_id,
            user_a_id,
            "tab_same",
            org_id=self.org_id,
            project_id=self.project_id,
            now_ts=600000,
        )
        self.touch_session_presence(
            other_session_id,
            user_a_id,
            "tab_same",
            org_id=self.org_id,
            project_id=self.project_id,
            now_ts=600000,
        )

        removed = self.leave_session_presence(
            self.session_id,
            user_a_id,
            "tab_same",
            org_id=self.foreign_org_id,
            project_id=self.project_id,
        )

        self.assertEqual(removed, 0)
        self.assertEqual(len(self.list_session_presence(self.session_id, org_id=self.org_id, project_id=self.project_id, now_ts=600001)), 1)
        self.assertEqual(len(self.list_session_presence(other_session_id, org_id=self.org_id, project_id=self.project_id, now_ts=600001)), 1)


if __name__ == "__main__":
    unittest.main()
