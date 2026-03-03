import os
import tempfile
import time
import unittest
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str = ""):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class AuditRetentionCleanupTest(unittest.TestCase):
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
        from app.main import cleanup_org_audit_endpoint
        from app.storage import (
            append_audit_log,
            create_org_record,
            get_default_org_id,
            get_storage,
            list_audit_log,
            upsert_org_membership,
        )

        self.create_user = create_user
        self.cleanup_org_audit_endpoint = cleanup_org_audit_endpoint
        self.append_audit_log = append_audit_log
        self.create_org_record = create_org_record
        self.get_default_org_id = get_default_org_id
        self.list_audit_log = list_audit_log
        self.upsert_org_membership = upsert_org_membership

        _ = get_storage()

        self.admin = create_user("audit_retention_admin@local", "admin", is_admin=True)
        self.uid = str(self.admin.get("id") or "")
        self.org_a = get_default_org_id()
        self.org_b = str(create_org_record("Org B", created_by=self.uid).get("id") or "")
        self.upsert_org_membership(self.org_a, self.uid, "org_admin")
        self.upsert_org_membership(self.org_b, self.uid, "org_admin")

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

    def _mk_req(self, org_id: str):
        return _DummyRequest(self.admin, active_org_id=org_id)

    def test_cleanup_removes_only_old_rows_for_target_org(self):
        now = int(time.time())
        old_ts = now - (120 * 24 * 60 * 60)
        recent_ts = now - 120

        self.append_audit_log(
            actor_user_id=self.uid,
            org_id=self.org_a,
            action="report.delete",
            entity_type="report_version",
            entity_id="rpt_old_a",
            status="ok",
            meta={"seed": "old_a"},
            ts=old_ts,
        )
        self.append_audit_log(
            actor_user_id=self.uid,
            org_id=self.org_a,
            action="report.build",
            entity_type="report_version",
            entity_id="rpt_new_a",
            status="ok",
            meta={"seed": "new_a"},
            ts=recent_ts,
        )
        self.append_audit_log(
            actor_user_id=self.uid,
            org_id=self.org_b,
            action="report.delete",
            entity_type="report_version",
            entity_id="rpt_old_b",
            status="ok",
            meta={"seed": "old_b"},
            ts=old_ts,
        )

        out = self.cleanup_org_audit_endpoint(self.org_a, self._mk_req(self.org_a), retention_days=90)
        self.assertTrue(isinstance(out, dict))
        self.assertEqual(int(out.get("deleted") or 0), 1)

        org_a_rows = self.list_audit_log(self.org_a, limit=100)
        org_a_ids = {str((row or {}).get("entity_id") or "") for row in org_a_rows}
        self.assertIn("rpt_new_a", org_a_ids)
        self.assertNotIn("rpt_old_a", org_a_ids)

        org_b_rows = self.list_audit_log(self.org_b, limit=100)
        org_b_ids = {str((row or {}).get("entity_id") or "") for row in org_b_rows}
        self.assertIn("rpt_old_b", org_b_ids)


if __name__ == "__main__":
    unittest.main()
