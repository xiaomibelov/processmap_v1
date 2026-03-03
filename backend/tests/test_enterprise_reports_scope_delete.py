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


class EnterpriseReportsScopeDeleteTest(unittest.TestCase):
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
            list_org_session_report_versions,
        )
        from app.models import ReportVersion
        from app.storage import (
            get_default_org_id,
            get_project_storage,
            get_storage,
            upsert_project_membership,
        )

        self.create_user = create_user
        self.delete_org_session_report_version = delete_org_session_report_version
        self.list_org_session_report_versions = list_org_session_report_versions
        self.ReportVersion = ReportVersion
        self.get_default_org_id = get_default_org_id
        self.get_project_storage = get_project_storage
        self.get_storage = get_storage
        self.upsert_project_membership = upsert_project_membership
        # force sqlite schema bootstrap before direct SQL inserts
        _ = get_storage()
        _ = get_project_storage()

        self.admin = create_user("reports_admin@local", "admin", is_admin=True)
        self.pm = create_user("reports_pm@local", "pm", is_admin=False)
        self.viewer = create_user("reports_viewer@local", "viewer", is_admin=False)
        self.scoped = create_user("reports_scoped@local", "scoped", is_admin=False)

        self.default_org_id = get_default_org_id()
        self._insert_org_membership(self.default_org_id, str(self.admin.get("id") or ""), "org_admin")
        self._insert_org_membership(self.default_org_id, str(self.pm.get("id") or ""), "project_manager")
        self._insert_org_membership(self.default_org_id, str(self.viewer.get("id") or ""), "viewer")
        self._insert_org_membership(self.default_org_id, str(self.scoped.get("id") or ""), "editor")

        ps = get_project_storage()
        st = get_storage()
        self.project_id = ps.create("Reports Project", passport={}, user_id=str(self.admin.get("id") or ""), org_id=self.default_org_id)
        self.other_project_id = ps.create("Other Project", passport={}, user_id=str(self.admin.get("id") or ""), org_id=self.default_org_id)
        self.session_id = st.create(
            "Reports Session",
            roles=["operator"],
            project_id=self.project_id,
            mode="quick_skeleton",
            user_id=str(self.admin.get("id") or ""),
            org_id=self.default_org_id,
        )

        self.upsert_project_membership(self.default_org_id, self.project_id, str(self.pm.get("id") or ""), "project_manager")
        self.upsert_project_membership(self.default_org_id, self.project_id, str(self.viewer.get("id") or ""), "viewer")
        self.upsert_project_membership(self.default_org_id, self.other_project_id, str(self.scoped.get("id") or ""), "editor")

        self.report_1, self.report_2 = self._seed_reports(self.session_id, "primary")

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

    def _insert_org_membership(self, org_id: str, user_id: str, role: str):
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

    def _seed_reports(self, session_id: str, path_id: str):
        st = self.get_storage()
        sess = st.load(session_id, org_id=self.default_org_id, is_admin=True)
        now = int(time.time())
        row1 = self.ReportVersion(
            id="rpt_scope_1",
            session_id=session_id,
            path_id=path_id,
            version=1,
            steps_hash="hash_1",
            created_at=now - 3,
            status="ok",
            model="deepseek-chat",
            prompt_template_version="v2",
            request_payload_json={},
            payload_normalized={"title": "R1", "summary": []},
            payload_raw={},
            report_json={"title": "R1", "summary": []},
            raw_json={},
            report_markdown="# R1",
            recommendations_json=[],
            missing_data_json=[],
            risks_json=[],
            warnings_json=[],
            error_message=None,
        ).model_dump()
        row2 = self.ReportVersion(
            id="rpt_scope_2",
            session_id=session_id,
            path_id=path_id,
            version=2,
            steps_hash="hash_2",
            created_at=now - 1,
            status="ok",
            model="deepseek-chat",
            prompt_template_version="v2",
            request_payload_json={},
            payload_normalized={"title": "R2", "summary": []},
            payload_raw={},
            report_json={"title": "R2", "summary": []},
            raw_json={},
            report_markdown="# R2",
            recommendations_json=[],
            missing_data_json=[],
            risks_json=[],
            warnings_json=[],
            error_message=None,
        ).model_dump()
        interview = dict(getattr(sess, "interview", {}) or {})
        interview["report_versions"] = {path_id: [row1, row2]}
        interview["path_reports"] = {path_id: row2}
        sess.interview = interview
        st.save(sess, user_id=str(self.admin.get("id") or ""), org_id=self.default_org_id, is_admin=True)
        return row1, row2

    def test_list_and_delete_report_versions_scoped(self):
        req_pm = self._mk_req(self.pm)

        listed = self.list_org_session_report_versions(
            self.default_org_id,
            self.session_id,
            req_pm,
            path_id="primary",
        )
        self.assertTrue(isinstance(listed, list))
        ids_before = {str(item.get("id") or "") for item in listed}
        self.assertIn("rpt_scope_1", ids_before)
        self.assertIn("rpt_scope_2", ids_before)

        resp = self.delete_org_session_report_version(
            self.default_org_id,
            self.session_id,
            "rpt_scope_2",
            req_pm,
            path_id="primary",
        )
        self.assertEqual(int(getattr(resp, "status_code", 0) or 0), 204)

        listed_after = self.list_org_session_report_versions(
            self.default_org_id,
            self.session_id,
            req_pm,
            path_id="primary",
        )
        ids_after = {str(item.get("id") or "") for item in listed_after}
        self.assertIn("rpt_scope_1", ids_after)
        self.assertNotIn("rpt_scope_2", ids_after)

    def test_scoped_user_with_assignment_in_other_project_gets_404(self):
        req_scoped = self._mk_req(self.scoped)
        out = self.list_org_session_report_versions(
            self.default_org_id,
            self.session_id,
            req_scoped,
            path_id="primary",
        )
        self.assertEqual(int(getattr(out, "status_code", 0) or 0), 404)

    def test_viewer_cannot_delete_report_version(self):
        req_viewer = self._mk_req(self.viewer)
        out = self.delete_org_session_report_version(
            self.default_org_id,
            self.session_id,
            "rpt_scope_1",
            req_viewer,
            path_id="primary",
        )
        self.assertEqual(int(getattr(out, "status_code", 0) or 0), 403)


if __name__ == "__main__":
    unittest.main()
