import os
import tempfile
import unittest
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str = "", org_memberships: list | None = None):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.state.org_memberships = list(org_memberships or [])
        self.headers = {}


class AdminTablePaginationApiTest(unittest.TestCase):
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
        from app.routers.admin import admin_audit, admin_projects, admin_sessions
        from app.storage import append_audit_log, get_default_org_id, get_project_storage, get_storage, list_user_org_memberships

        self.admin_audit = admin_audit
        self.admin_projects = admin_projects
        self.admin_sessions = admin_sessions
        self.append_audit_log = append_audit_log
        self.get_project_storage = get_project_storage
        self.get_storage = get_storage

        self.admin = create_user("platform_admin@local", "strongpass1", is_admin=True)
        self.default_org_id = get_default_org_id()
        memberships = list_user_org_memberships(str(self.admin.get("id") or ""), is_admin=True)
        self.request = _DummyRequest(self.admin, active_org_id=self.default_org_id, org_memberships=memberships)

        self._seed_workspace_rows()

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

    def _seed_workspace_rows(self):
        project_storage = self.get_project_storage()
        session_storage = self.get_storage()
        admin_id = str(self.admin.get("id") or "")

        self.project_ids = []
        self.session_ids = []

        for pidx in range(4):
            pid = project_storage.create(
                title=f"Project {pidx + 1}",
                user_id=admin_id,
                org_id=self.default_org_id,
            )
            self.project_ids.append(pid)
            for sidx in range(3):
                sid = session_storage.create(
                    title=f"Session {pidx + 1}-{sidx + 1}",
                    project_id=pid,
                    user_id=admin_id,
                    is_admin=True,
                    org_id=self.default_org_id,
                )
                self.session_ids.append(sid)
                self.append_audit_log(
                    actor_user_id=admin_id,
                    org_id=self.default_org_id,
                    project_id=pid,
                    session_id=sid,
                    action=f"admin.test.event.{pidx}.{sidx}",
                    entity_type="session",
                    entity_id=sid,
                    status="ok" if sidx % 2 == 0 else "fail",
                )

        # one row for q filter assertion
        self.append_audit_log(
            actor_user_id=admin_id,
            org_id=self.default_org_id,
            project_id=self.project_ids[0],
            session_id=self.session_ids[0],
            action="admin.special.pagination.check",
            entity_type="session",
            entity_id=self.session_ids[0],
            status="ok",
        )

    def test_admin_projects_supports_limit_offset_pagination(self):
        first = self.admin_projects(self.request, q="", limit=2, offset=0)
        self.assertTrue(bool(first.get("ok")))
        self.assertEqual(int((first.get("page") or {}).get("limit") or 0), 2)
        self.assertEqual(int((first.get("page") or {}).get("offset") or 0), 0)
        total = int((first.get("page") or {}).get("total") or 0)
        self.assertGreaterEqual(total, 4)
        first_ids = [str(item.get("project_id") or "") for item in (first.get("items") or [])]
        self.assertEqual(len(first_ids), 2)

        second = self.admin_projects(self.request, q="", limit=2, offset=2)
        self.assertTrue(bool(second.get("ok")))
        second_ids = [str(item.get("project_id") or "") for item in (second.get("items") or [])]
        self.assertGreaterEqual(len(second_ids), 1)
        self.assertTrue(set(first_ids).isdisjoint(set(second_ids)))

    def test_admin_sessions_supports_limit_offset_pagination(self):
        first = self.admin_sessions(self.request, q="", status="", owner_ids="", limit=3, offset=0)
        self.assertTrue(bool(first.get("ok")))
        self.assertEqual(int((first.get("page") or {}).get("limit") or 0), 3)
        self.assertEqual(int((first.get("page") or {}).get("offset") or 0), 0)
        total = int((first.get("page") or {}).get("total") or 0)
        self.assertGreaterEqual(total, 12)
        first_ids = [str(item.get("session_id") or "") for item in (first.get("items") or [])]
        self.assertEqual(len(first_ids), 3)

        second = self.admin_sessions(self.request, q="", status="", owner_ids="", limit=3, offset=3)
        self.assertTrue(bool(second.get("ok")))
        second_ids = [str(item.get("session_id") or "") for item in (second.get("items") or [])]
        self.assertEqual(len(second_ids), 3)
        self.assertTrue(set(first_ids).isdisjoint(set(second_ids)))

    def test_admin_audit_supports_limit_offset_and_query_filter(self):
        first = self.admin_audit(
            self.request,
            q="admin.test.event",
            status="",
            action="",
            session_id="",
            project_id="",
            limit=2,
            offset=0,
        )
        self.assertTrue(bool(first.get("ok")))
        self.assertEqual(int((first.get("page") or {}).get("limit") or 0), 2)
        self.assertEqual(int((first.get("page") or {}).get("offset") or 0), 0)
        total = int((first.get("page") or {}).get("total") or 0)
        self.assertGreaterEqual(total, 12)
        self.assertEqual(len(first.get("items") or []), 2)

        second = self.admin_audit(
            self.request,
            q="admin.test.event",
            status="",
            action="",
            session_id="",
            project_id="",
            limit=2,
            offset=2,
        )
        self.assertTrue(bool(second.get("ok")))
        self.assertEqual(len(second.get("items") or []), 2)

        special = self.admin_audit(
            self.request,
            q="special.pagination.check",
            status="",
            action="",
            session_id="",
            project_id="",
            limit=10,
            offset=0,
        )
        self.assertTrue(bool(special.get("ok")))
        self.assertEqual(int((special.get("page") or {}).get("total") or 0), 1)
        self.assertEqual(len(special.get("items") or []), 1)


if __name__ == "__main__":
    unittest.main()
