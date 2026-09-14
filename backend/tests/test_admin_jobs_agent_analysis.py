"""Контрактные тесты эмиссии job_type="agent_analysis" в /api/admin/jobs.

Эмиссия читает bpmn_meta.agent_analysis_v1 (рядом с autopass/report_doc).
Autopass/report_doc записи не меняются.
"""
import os
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id, org_memberships=[])
        self.headers = {}


def _seed_meta(sid: str, user_id: str, org_id: str, key: str, value: dict) -> None:
    from app.storage import get_storage

    st = get_storage()
    sess = st.load(sid, org_id=org_id or None, is_admin=True)
    meta = dict(getattr(sess, "bpmn_meta", {}) or {})
    meta[key] = value
    sess.bpmn_meta = meta
    st.save(sess, user_id=user_id, is_admin=True, org_id=org_id or None)


class AdminJobsAgentAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._old_env = {k: os.environ.get(k) for k in ("PROCESS_DB_PATH", "PROCESS_STORAGE_DIR", "FPC_DB_BACKEND", "DATABASE_URL")}
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "admin_jobs.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        import importlib

        import app.storage as storage
        importlib.reload(storage)
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

        from app.auth import create_user
        from app.storage import get_default_org_id

        self.org_id = get_default_org_id()
        self.admin_user = create_user("admin_jobs@local", "adminpass", is_admin=True)
        self.admin_id = str(self.admin_user.get("id") or "")
        self.request = _DummyRequest(self.admin_user, active_org_id=self.org_id)

        from app.routers.admin import admin_jobs

        self.admin_jobs = admin_jobs

    def tearDown(self):
        for key, old in self._old_env.items():
            if old is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old
        self.tmp.cleanup()

    def _create_session(self, title: str) -> str:
        from app.repositories import session_repo

        return session_repo.create(
            title=title,
            user_id=self.admin_id,
            is_admin=True,
            org_id=self.org_id,
        )

    def _jobs(self):
        with mock.patch(
            "app.routers.admin.runtime_status", return_value={"mode": "redis", "state": "ok"}
        ), mock.patch(
            "app.routers.admin.redis_queue_enabled", return_value=False
        ):
            resp = self.admin_jobs(self.request)
        if hasattr(resp, "status_code"):
            raise AssertionError(f"admin_jobs вернул ошибку: {resp.status_code} {resp.body}")
        return resp

    def test_agent_analysis_emitted_when_artifact_present(self):
        sid = self._create_session("aa-jobs")
        _seed_meta(sid, self.admin_id, self.org_id, "agent_analysis_v1", {
            "schema_version": "agent_analysis_v1.1",
            "run_id": "ana_run1",
            "status": "done",
            "generated_at": "2026-09-14T00:00:00+00:00",
        })
        out = self._jobs()
        rows = [r for r in out["items"] if r["session_id"] == sid and r["job_type"] == "agent_analysis"]
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["job_id"], "ana_run1")
        self.assertEqual(row["status"], "done")
        self.assertEqual(row["run_id"], "ana_run1")
        self.assertEqual(row["updated_at"], "2026-09-14T00:00:00+00:00")

    def test_agent_analysis_failed_status_mapped(self):
        sid = self._create_session("aa-jobs-failed")
        _seed_meta(sid, self.admin_id, self.org_id, "agent_analysis_v1", {
            "schema_version": "agent_analysis_v1.1",
            "run_id": "ana_run2",
            "status": "failed",
            "generated_at": "2026-09-14T01:00:00+00:00",
            "error": "llm_error",
        })
        out = self._jobs()
        row = next(r for r in out["items"] if r["session_id"] == sid and r["job_type"] == "agent_analysis")
        self.assertEqual(row["status"], "failed")
        self.assertEqual(row["last_error"], "llm_error")
        self.assertEqual(out["summary"]["failed"], 1)

    def test_no_agent_analysis_row_when_artifact_absent(self):
        sid = self._create_session("aa-jobs-empty")
        out = self._jobs()
        self.assertFalse(any(r["session_id"] == sid for r in out["items"]))

    def test_autopass_and_report_doc_unchanged(self):
        sid = self._create_session("aa-jobs-mix")
        _seed_meta(sid, self.admin_id, self.org_id, "auto_pass_v1", {
            "job_id": "ap_1",
            "status": "done",
            "run_id": "run_ap",
            "retry_count": 2,
            "lock_busy_count": 1,
            "duration_s": 30,
            "generated_at": "2026-09-13T00:00:00+00:00",
        })
        _seed_meta(sid, self.admin_id, self.org_id, "agent_analysis_v1", {
            "schema_version": "agent_analysis_v1.1",
            "run_id": "ana_run3",
            "status": "done",
            "generated_at": "2026-09-14T02:00:00+00:00",
        })
        out = self._jobs()
        auto = [r for r in out["items"] if r["job_type"] == "autopass"]
        self.assertEqual(len(auto), 1)
        self.assertEqual(auto[0]["job_id"], "ap_1")
        self.assertEqual(auto[0]["retries"], 2)
        self.assertEqual(auto[0]["duration_s"], 30)
        types = {r["job_type"] for r in out["items"] if r["session_id"] == sid}
        self.assertEqual(types, {"autopass", "agent_analysis"})
