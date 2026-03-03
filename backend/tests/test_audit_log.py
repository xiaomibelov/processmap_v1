import os
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str = ""):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class AuditLogApiTest(unittest.TestCase):
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
            delete_org_session_report_version,
            list_org_audit_endpoint,
        )
        from app.models import ReportVersion
        from app.storage import get_default_org_id, get_project_storage, get_storage

        self.create_user = create_user
        self.delete_org_session_report_version = delete_org_session_report_version
        self.list_org_audit_endpoint = list_org_audit_endpoint
        self.ReportVersion = ReportVersion
        self.get_default_org_id = get_default_org_id
        self.get_project_storage = get_project_storage
        self.get_storage = get_storage
        _ = get_storage()
        _ = get_project_storage()

        self.admin = create_user("audit_admin@local", "admin", is_admin=True)
        self.auditor = create_user("audit_auditor@local", "auditor", is_admin=False)
        self.editor = create_user("audit_editor@local", "editor", is_admin=False)

        self.default_org_id = get_default_org_id()
        self._insert_membership(self.default_org_id, str(self.admin.get("id") or ""), "org_admin")
        self._insert_membership(self.default_org_id, str(self.auditor.get("id") or ""), "auditor")
        self._insert_membership(self.default_org_id, str(self.editor.get("id") or ""), "editor")

        ps = get_project_storage()
        st = get_storage()
        self.project_id = ps.create("Audit Project", passport={}, user_id=str(self.admin.get("id") or ""), org_id=self.default_org_id)
        self.session_id = st.create(
            "Audit Session",
            roles=["operator"],
            project_id=self.project_id,
            mode="quick_skeleton",
            user_id=str(self.admin.get("id") or ""),
            org_id=self.default_org_id,
        )
        self.report_id = self._seed_report(self.session_id, "primary")

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

    def _seed_report(self, session_id: str, path_id: str) -> str:
        st = self.get_storage()
        sess = st.load(session_id, org_id=self.default_org_id, is_admin=True)
        now = int(time.time())
        row = self.ReportVersion(
            id="rpt_audit_1",
            session_id=session_id,
            path_id=path_id,
            version=1,
            steps_hash="hash_audit",
            created_at=now - 2,
            status="ok",
            model="deepseek-chat",
            prompt_template_version="v2",
            request_payload_json={},
            payload_normalized={"title": "Audit", "summary": []},
            payload_raw={},
            report_json={"title": "Audit", "summary": []},
            raw_json={},
            report_markdown="# Audit",
            recommendations_json=[],
            missing_data_json=[],
            risks_json=[],
            warnings_json=[],
            error_message=None,
        ).model_dump()
        interview = dict(getattr(sess, "interview", {}) or {})
        interview["report_versions"] = {path_id: [row]}
        interview["path_reports"] = {path_id: row}
        sess.interview = interview
        st.save(sess, user_id=str(self.admin.get("id") or ""), org_id=self.default_org_id, is_admin=True)
        return str(row.get("id") or "")

    def test_audit_records_created_on_report_delete_and_filtered(self):
        req_admin = self._mk_req(self.admin)
        resp = self.delete_org_session_report_version(
            self.default_org_id,
            self.session_id,
            self.report_id,
            req_admin,
            path_id="primary",
        )
        self.assertEqual(int(getattr(resp, "status_code", 0) or 0), 204)

        req_auditor = self._mk_req(self.auditor)
        listed = self.list_org_audit_endpoint(self.default_org_id, req_auditor, limit=50, action="report.delete")
        self.assertTrue(isinstance(listed, dict))
        self.assertGreaterEqual(int(listed.get("count") or 0), 1)
        actions = {str((item or {}).get("action") or "") for item in (listed.get("items") or [])}
        self.assertIn("report.delete", actions)

    def test_auditor_can_read_editor_cannot(self):
        req_auditor = self._mk_req(self.auditor)
        out_auditor = self.list_org_audit_endpoint(self.default_org_id, req_auditor, limit=10)
        self.assertTrue(isinstance(out_auditor, dict))
        self.assertIn("items", out_auditor)

        req_editor = self._mk_req(self.editor)
        out_editor = self.list_org_audit_endpoint(self.default_org_id, req_editor, limit=10)
        self.assertEqual(int(getattr(out_editor, "status_code", 0) or 0), 403)


if __name__ == "__main__":
    unittest.main()
