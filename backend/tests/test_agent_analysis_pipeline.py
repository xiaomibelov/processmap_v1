"""Tests for the background agent-analysis pipeline (Phase 1, contour architecture/autopass-agent-migration-v1).

Live-safety contract under test:
- agent analysis adds ZERO synchronous heavy work to the save path
  (fire-and-forget Celery enqueue by pattern of publish_session_saved);
- feature is disabled by default (no/disabled llm_feature_flags row -> no tasks);
- worker reads a DB snapshot and writes only bpmn_meta.agent_analysis_v1
  (never bpmn_xml, never the live canvas);
- debounce: identical schema re-saves do not re-trigger LLM work;
- LLM/RAG/Redis failures never break the save and never corrupt the session.

Паттерн БД: реальная dev-БД Postgres (как test_llm_gateway.py / test_admin_llm_api.py),
т.к. llm_store-таблицы не создаются в SQLite-изоляции conftest.
"""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

DATABASE_URL = os.environ.get("E2_TEST_DATABASE_URL", "postgresql://fpc:fpc@localhost:5432/processmap")


@pytest.fixture(autouse=True)
def _pg_env():
    old_env = {k: os.environ.get(k) for k in ("DATABASE_URL", "FPC_DB_BACKEND", "DEEPSEEK_API_KEY")}
    os.environ["DATABASE_URL"] = DATABASE_URL
    os.environ["FPC_DB_BACKEND"] = "postgres"
    os.environ.pop("DEEPSEEK_API_KEY", None)
    import backend.app.storage as _st
    from backend.app.db.config import get_db_runtime_config

    get_db_runtime_config.cache_clear()
    old_pool = _st._PG_POOL
    _st._PG_POOL = None
    yield
    _st._PG_POOL = old_pool
    get_db_runtime_config.cache_clear()
    for key, value in old_env.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


from backend.app.ai import llm_store  # noqa: E402
from backend.app.auth import create_user  # noqa: E402
from backend.app.storage import (  # noqa: E402
    create_org_record,
    get_storage,
    upsert_org_membership,
    upsert_project_membership,
)

FEATURE = "agent_analysis"


class _SessionFixture:
    def __init__(self) -> None:
        suffix = uuid.uuid4().hex
        owner = create_user(f"owner_aa_{suffix}@local", "password", is_admin=True)
        self.org_id = f"org_aa_{suffix}"
        create_org_record("AA Org", created_by=str(owner["id"]), org_id=self.org_id)
        upsert_org_membership(self.org_id, str(owner["id"]), "owner")
        upsert_project_membership(self.org_id, "proj_1", str(owner["id"]), "owner")
        self.user_id = str(owner["id"])
        st = get_storage()
        self.session_id = st.create(
            title="agent-analysis-session",
            user_id=self.user_id,
            org_id=self.org_id,
            project_id="proj_1",
        )


def _make_session() -> _SessionFixture:
    return _SessionFixture()


class TestPublisher(unittest.TestCase):
    @patch("backend.app.agent_analysis.publisher.run_agent_analysis_task")
    def test_disabled_when_feature_flag_row_missing(self, mock_task):
        # Unknown feature name -> get_feature_flag returns None -> no enqueue.
        with patch("backend.app.agent_analysis.publisher.FEATURE", f"agent_analysis_missing_{uuid.uuid4().hex[:8]}"):
            from backend.app.agent_analysis.publisher import publish_agent_analysis_scheduled

            publish_agent_analysis_scheduled("sid_x", "org_x")
        mock_task.apply_async.assert_not_called()

    @patch("backend.app.agent_analysis.publisher.run_agent_analysis_task")
    def test_enqueues_when_feature_enabled(self, mock_task):
        llm_store.patch_feature_flag(FEATURE, enabled=True, actor="test")
        from backend.app.agent_analysis.publisher import publish_agent_analysis_scheduled

        publish_agent_analysis_scheduled("sid_x", "org_x", user_id="u1")
        mock_task.apply_async.assert_called_once()
        args = mock_task.apply_async.call_args.kwargs.get("args") or mock_task.apply_async.call_args.args[0]
        self.assertEqual(list(args)[:2], ["sid_x", "org_x"])
        self.assertIn("countdown", mock_task.apply_async.call_args.kwargs)

    @patch("backend.app.agent_analysis.publisher.run_agent_analysis_task")
    def test_explicitly_disabled_flag_blocks_enqueue(self, mock_task):
        llm_store.patch_feature_flag(FEATURE, enabled=False, actor="test")
        from backend.app.agent_analysis.publisher import publish_agent_analysis_scheduled

        publish_agent_analysis_scheduled("sid_x", "org_x")
        mock_task.apply_async.assert_not_called()

    @patch("backend.app.agent_analysis.publisher.run_agent_analysis_task")
    def test_trigger_setting_off_blocks_enqueue(self, mock_task):
        llm_store.patch_feature_flag(FEATURE, enabled=True, actor="test")
        from backend.app.agent_analysis.publisher import publish_agent_analysis_scheduled

        with patch("backend.app.agent_analysis.publisher.save_trigger_enabled", return_value=False):
            publish_agent_analysis_scheduled("sid_x", "org_x")
        mock_task.apply_async.assert_not_called()

    @patch("backend.app.agent_analysis.publisher.run_agent_analysis_task")
    def test_enqueue_error_swallowed(self, mock_task):
        llm_store.patch_feature_flag(FEATURE, enabled=True, actor="test")
        mock_task.apply_async.side_effect = RuntimeError("broker down")
        from backend.app.agent_analysis.publisher import publish_agent_analysis_scheduled

        publish_agent_analysis_scheduled("sid_x", "org_x")  # must not raise

    @patch("backend.app.redis_client.get_client", return_value=None)
    @patch("backend.app.agent_analysis.publisher.run_agent_analysis_task")
    def test_publish_works_without_redis(self, mock_task, _mock_client):
        llm_store.patch_feature_flag(FEATURE, enabled=True, actor="test")
        from backend.app.agent_analysis.publisher import publish_agent_analysis_scheduled

        publish_agent_analysis_scheduled("sid_x", "org_x")  # must not raise
        mock_task.apply_async.assert_called_once()


class TestProcessor(unittest.TestCase):
    @patch("backend.app.agent_analysis.processor.complete")
    @patch("backend.app.agent_analysis.processor._rag_search", return_value={"hits": 0, "items": []})
    def test_run_persists_done_artifact(self, _mock_rag, mock_complete):
        mock_complete.return_value = {
            "ok": True,
            "status": "ok",
            "model": "test-model",
            "json": {"summary": "ok", "risks": [], "recommendations": []},
        }
        fx = _make_session()
        from backend.app.agent_analysis.processor import run_agent_analysis

        out = run_agent_analysis(fx.session_id, fx.org_id, user_id=fx.user_id)

        self.assertEqual(out["status"], "done")
        st = get_storage()
        sess = st.load(fx.session_id, org_id=fx.org_id, is_admin=True)
        art = (getattr(sess, "bpmn_meta", {}) or {}).get("agent_analysis_v1")
        self.assertIsInstance(art, dict)
        self.assertEqual(art["schema_version"], "agent_analysis_v1.1")
        self.assertEqual(art["status"], "done")
        self.assertTrue(str(art.get("run_id") or "").strip())
        self.assertIn("precheck", art)
        self.assertIn("rag", art)
        self.assertIn("analysis", art)

    @patch("backend.app.agent_analysis.processor.complete")
    @patch("backend.app.agent_analysis.processor._rag_search", return_value={"hits": 0, "items": []})
    def test_failed_llm_persists_failed_artifact(self, _mock_rag, mock_complete):
        mock_complete.return_value = {"ok": False, "status": "no_provider", "error": "no provider"}
        fx = _make_session()
        from backend.app.agent_analysis.processor import run_agent_analysis

        out = run_agent_analysis(fx.session_id, fx.org_id, user_id=fx.user_id)

        self.assertEqual(out["status"], "failed")
        st = get_storage()
        sess = st.load(fx.session_id, org_id=fx.org_id, is_admin=True)
        art = (getattr(sess, "bpmn_meta", {}) or {}).get("agent_analysis_v1")
        self.assertEqual(art["status"], "failed")
        self.assertTrue(str(art.get("error") or "").strip())

    @patch("backend.app.agent_analysis.processor.complete")
    @patch("backend.app.agent_analysis.processor._rag_search", return_value={"hits": 0, "items": []})
    def test_identical_schema_is_not_recomputed(self, _mock_rag, mock_complete):
        mock_complete.return_value = {
            "ok": True,
            "status": "ok",
            "json": {"summary": "ok", "risks": [], "recommendations": []},
        }
        fx = _make_session()
        from backend.app.agent_analysis.processor import run_agent_analysis

        first = run_agent_analysis(fx.session_id, fx.org_id, user_id=fx.user_id)
        second = run_agent_analysis(fx.session_id, fx.org_id, user_id=fx.user_id)

        self.assertEqual(first["status"], "done")
        self.assertEqual(second["status"], "skipped")
        self.assertEqual(mock_complete.call_count, 1)

    def test_missing_session_raises(self):
        from backend.app.agent_analysis.processor import run_agent_analysis

        with self.assertRaises(RuntimeError):
            run_agent_analysis(f"no_such_{uuid.uuid4().hex}", "org_x")

    @patch("backend.app.agent_analysis.processor._rag_search", side_effect=RuntimeError("rag down"))
    @patch("backend.app.agent_analysis.processor.complete")
    def test_rag_failure_still_produces_artifact(self, mock_complete, _mock_rag):
        mock_complete.return_value = {
            "ok": True,
            "status": "ok",
            "json": {"summary": "ok", "risks": [], "recommendations": []},
        }
        fx = _make_session()
        from backend.app.agent_analysis.processor import run_agent_analysis

        out = run_agent_analysis(fx.session_id, fx.org_id, user_id=fx.user_id)
        self.assertEqual(out["status"], "done")
        self.assertEqual(out["rag"], {"hits": 0, "items": [], "error": "rag down"})


class TestCeleryTask(unittest.TestCase):
    @patch("backend.app.agent_analysis.tasks.run_agent_analysis")
    def test_task_calls_processor(self, mock_run):
        from backend.app.agent_analysis.tasks import run_agent_analysis_task

        mock_run.return_value = {"status": "done"}
        result = run_agent_analysis_task.run("sid_x", "org_x", "u1")
        mock_run.assert_called_once_with("sid_x", "org_x", user_id="u1")
        self.assertEqual(result, {"status": "done"})

    @patch("backend.app.agent_analysis.tasks.run_agent_analysis_task.retry")
    @patch("backend.app.agent_analysis.tasks.run_agent_analysis")
    def test_task_retries_on_failure(self, mock_run, mock_retry):
        from backend.app.agent_analysis.tasks import run_agent_analysis_task

        mock_run.side_effect = RuntimeError("boom")
        mock_retry.return_value = MagicMock()
        with self.assertRaises(Exception):
            run_agent_analysis_task.run("sid_x", "org_x", "u1")
        mock_retry.assert_called_once()


class TestSaveHook(unittest.TestCase):
    """PATCH save must schedule analysis fire-and-forget and never break the save."""

    # NOTE: the legacy save flow runs in the `app.*` namespace
    # (session_service does `import app._legacy_main`), so the publisher
    # patch target is `app.agent_analysis.publisher.*` — same pattern as
    # test_analytics_aggregator.py.
    @patch("app.agent_analysis.publisher.publish_agent_analysis_scheduled")
    def test_patch_session_schedules_analysis(self, mock_publish):
        from fastapi.testclient import TestClient

        from backend.app.auth import create_access_token
        from backend.app.main import app

        fx = _make_session()
        client = TestClient(app)
        token = create_access_token(fx.user_id)

        response = client.patch(
            f"/api/sessions/{fx.session_id}",
            json={"title": f"renamed-{uuid.uuid4().hex[:8]}"},
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        mock_publish.assert_called_once()
        args = mock_publish.call_args.args
        self.assertEqual(args[0], fx.session_id)
        self.assertEqual(args[1], fx.org_id)

    @patch("app.agent_analysis.publisher.publish_agent_analysis_scheduled")
    def test_publish_failure_does_not_break_save(self, mock_publish):
        from fastapi.testclient import TestClient

        from backend.app.auth import create_access_token
        from backend.app.main import app

        fx = _make_session()
        client = TestClient(app)
        token = create_access_token(fx.user_id)
        mock_publish.side_effect = RuntimeError("enqueue exploded")

        response = client.patch(
            f"/api/sessions/{fx.session_id}",
            json={"title": f"renamed-{uuid.uuid4().hex[:8]}"},
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)


class TestManualEndpoints(unittest.TestCase):
    @patch("backend.app.agent_analysis.router.run_agent_analysis_task")
    def test_manual_run_enqueues_when_enabled(self, mock_task):
        llm_store.patch_feature_flag(FEATURE, enabled=True, actor="test")
        from fastapi.testclient import TestClient

        from backend.app.auth import create_access_token
        from backend.app.main import app

        fx = _make_session()
        client = TestClient(app)
        token = create_access_token(fx.user_id)
        mock_task.apply_async.return_value = MagicMock(id="job_123")

        response = client.post(
            f"/api/sessions/{fx.session_id}/agent-analysis",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["job_id"], "job_123")
        self.assertEqual(body["status"], "queued")

    def test_manual_run_rejected_when_feature_disabled(self):
        llm_store.patch_feature_flag(FEATURE, enabled=False, actor="test")
        from fastapi.testclient import TestClient

        from backend.app.auth import create_access_token
        from backend.app.main import app

        fx = _make_session()
        client = TestClient(app)
        token = create_access_token(fx.user_id)

        response = client.post(
            f"/api/sessions/{fx.session_id}/agent-analysis",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 404)

    @patch("backend.app.agent_analysis.router.app")
    def test_status_endpoint_returns_job_state(self, mock_celery_app):
        llm_store.patch_feature_flag(FEATURE, enabled=True, actor="test")
        from fastapi.testclient import TestClient

        from backend.app.auth import create_access_token
        from backend.app.main import app

        fx = _make_session()
        client = TestClient(app)
        token = create_access_token(fx.user_id)

        async_result = MagicMock()
        async_result.state = "SUCCESS"
        async_result.result = {"status": "done"}
        mock_celery_app.AsyncResult.return_value = async_result

        response = client.get(
            f"/api/sessions/{fx.session_id}/agent-analysis",
            params={"job_id": "job_123"},
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "done")


if __name__ == "__main__":
    unittest.main()
