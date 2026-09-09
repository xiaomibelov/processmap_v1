"""Контур perf/save-path-decoupling-v1 (TDD).

P1: _invalidate_session_caches не дёргает _workspace_id_for_project повторно
    (workspace_id берётся из get_project_explorer_invalidation_targets).
P3: audit session.update из hot save-path уходит через Celery-enqueue
    (паритет publish_session_saved), sync INSERT не выполняется в запросе.
"""
from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import pytest

pytestmark = pytest.mark.skip_if_hanging


class InvalidateCachesDbReadTests(unittest.TestCase):
    """P1: один DB-read на save вместо двух."""

    def _make_session_obj(self):
        obj = MagicMock()
        obj.id = "sess_1"
        obj.org_id = "org_1"
        obj.project_id = "proj_1"
        return obj

    def test_workspace_id_reused_from_targets_no_second_db_read(self):
        from app.sessions_core import _invalidate_session_caches

        targets = {"workspace_id": "ws_1", "children_folder_ids": []}
        with patch("app.sessions_core.explorer_invalidate_sessions"), \
             patch("app.sessions_core._invalidate_explorer_children_for_project", return_value=targets) as mock_children, \
             patch("app.sessions_core._invalidate_session_open_cache_for_session"), \
             patch("app.sessions_core._invalidate_tldr_cache_for_session"), \
             patch("app.sessions_core.session_cache"), \
             patch("app.analytics_cache.invalidate_analytics_scope") as mock_analytics, \
             patch("app._legacy_main._workspace_id_for_project") as mock_ws_lookup:
            _invalidate_session_caches(self._make_session_obj(), org_id="org_1")

        mock_ws_lookup.assert_not_called()
        self.assertEqual(mock_children.call_count, 1)
        # analytics-инвалидация по трём scope, workspace — из targets
        scopes = [c.args[0] for c in mock_analytics.call_args_list]
        self.assertEqual(scopes, ["session", "project", "workspace"])
        ws_call = mock_analytics.call_args_list[2]
        self.assertEqual(ws_call.args[1], "ws_1")

    def test_fallback_to_workspace_lookup_when_targets_missing(self):
        from app.sessions_core import _invalidate_session_caches

        with patch("app.sessions_core.explorer_invalidate_sessions"), \
             patch("app.sessions_core._invalidate_explorer_children_for_project", return_value=None), \
             patch("app.sessions_core._invalidate_session_open_cache_for_session"), \
             patch("app.sessions_core._invalidate_tldr_cache_for_session"), \
             patch("app.sessions_core.session_cache"), \
             patch("app.analytics_cache.invalidate_analytics_scope"), \
             patch("app._legacy_main._workspace_id_for_project", return_value="ws_fallback") as mock_ws_lookup:
            _invalidate_session_caches(self._make_session_obj(), org_id="org_1")

        mock_ws_lookup.assert_called_once_with("proj_1")


class SavePathAuditAsyncTests(unittest.TestCase):
    """P3: session.update audit уходит через Celery-enqueue, не sync."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        from app._legacy_main import (
            CreateSessionIn,
            UpdateSessionIn,
            create_session,
            patch_session,
        )

        self.UpdateSessionIn = UpdateSessionIn
        self.patch_session = patch_session
        created = create_session(CreateSessionIn(title="audit-async"))
        self.sid = str(created.get("id") or "")
        self.assertTrue(self.sid)

    def tearDown(self):
        self.tmp.cleanup()

    def test_publish_session_update_audit_enqueues_instead_of_sync_insert(self):
        from app.sessions_core import _publish_session_update_audit

        sess = MagicMock()
        sess.id = self.sid
        sess.org_id = ""
        sess.project_id = ""

        with patch("app.save_services.audit_publisher.publisher.append_audit_log_task") as mock_task, \
             patch("app.save_services.audit_publisher.tasks.append_audit_log") as mock_sync:
            _publish_session_update_audit(
                user_id="user_1",
                oid="org_1",
                sess=sess,
                session_id=self.sid,
                meta={"keys": ["notes"]},
            )

        mock_task.delay.assert_called_once()
        self.assertEqual(mock_task.delay.call_args.kwargs.get("action"), "session.update")
        self.assertEqual(mock_task.delay.call_args.kwargs.get("actor_user_id"), "user_1")
        mock_sync.assert_not_called()

    def test_publish_session_update_audit_no_actor_skips_enqueue(self):
        from app.sessions_core import _publish_session_update_audit

        sess = MagicMock()
        sess.id = self.sid

        with patch("app.save_services.audit_publisher.publisher.append_audit_log_task") as mock_task:
            _publish_session_update_audit(
                user_id="",
                oid="org_1",
                sess=sess,
                session_id=self.sid,
                meta={"keys": ["notes"]},
            )

        mock_task.delay.assert_not_called()

    def test_audit_enqueue_failure_does_not_break_save(self):
        from app.sessions_core import _publish_session_update_audit

        sess = MagicMock()
        sess.id = self.sid

        def _boom(*args, **kwargs):
            raise RuntimeError("broker unavailable")

        with patch("app.save_services.audit_publisher.publisher.append_audit_log_task") as mock_task:
            mock_task.delay.side_effect = _boom
            # Не должно поднять исключение в save-путь.
            _publish_session_update_audit(
                user_id="user_1",
                oid="org_1",
                sess=sess,
                session_id=self.sid,
                meta={"keys": ["notes"]},
            )
