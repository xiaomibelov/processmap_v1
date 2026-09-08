"""Контур perf/save-noop-fastpath-v1 (TDD).

PATCH /api/sessions/{id}: need_recompute только при реальном изменении
нормализованных значений, а не при наличии ключа в payload (no-op autosave).
"""
from __future__ import annotations

import os
import tempfile
import unittest

import pytest
from unittest.mock import patch

pytestmark = pytest.mark.skip_if_hanging


class SaveNoopFastpathTests(unittest.TestCase):
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
        self.create_session = create_session
        self.patch_session = patch_session

        created = self.create_session(CreateSessionIn(title="noop-fastpath"))
        self.sid = str(created.get("id") or "")
        self.assertTrue(self.sid)

    def tearDown(self):
        self.tmp.cleanup()

    def _load(self):
        from app._legacy_main import get_storage

        sess = get_storage().load(self.sid, is_admin=True)
        self.assertIsNotNone(sess)
        return sess

    def _nodes_payload(self):
        return [
            {"id": "n1", "title": "Шаг 1", "type": "step", "actor_role": "cook_1"},
            {"id": "n2", "title": "Шаг 2", "type": "step", "actor_role": "cook_1"},
        ]

    def test_identical_nodes_patch_skips_recompute(self):
        import app._legacy_main as lm

        with patch.object(lm, "_recompute_session", wraps=lm._recompute_session) as spy:
            first = self.patch_session(self.sid, self.UpdateSessionIn(nodes=self._nodes_payload()))
            version_after_first = self._load().version
            second = self.patch_session(self.sid, self.UpdateSessionIn(nodes=self._nodes_payload()))

        self.assertEqual(spy.call_count, 1, "no-op PATCH не должен вызывать _recompute_session")
        self.assertEqual(self._load().version, version_after_first, "version не должен расти на no-op патче")

    def test_changed_nodes_trigger_recompute(self):
        import app._legacy_main as lm

        with patch.object(lm, "_recompute_session", wraps=lm._recompute_session) as spy:
            self.patch_session(self.sid, self.UpdateSessionIn(nodes=self._nodes_payload()))
            changed = self._nodes_payload() + [{"id": "n3", "title": "Шаг 3", "type": "step", "actor_role": "cook_1"}]
            self.patch_session(self.sid, self.UpdateSessionIn(nodes=changed))

        self.assertEqual(spy.call_count, 2, "изменение nodes должно вызывать _recompute_session")

    def test_legacy_alias_payload_normalizing_to_current_value_skips_recompute(self):
        import app._legacy_main as lm

        with patch.object(lm, "_recompute_session", wraps=lm._recompute_session) as spy:
            self.patch_session(self.sid, self.UpdateSessionIn(nodes=self._nodes_payload()))
            aliased = [
                {"id": "n1", "title": "Шаг 1", "type": "task", "actorRole": "cook_1"},
                {"id": "n2", "title": "Шаг 2", "type": "task", "actorRole": "cook_1"},
            ]
            self.patch_session(self.sid, self.UpdateSessionIn(nodes=aliased))

        self.assertEqual(spy.call_count, 1, "алиасы, нормализующиеся к текущему значению — skip")

    def test_unchanged_roles_and_notes_skip_recompute(self):
        import app._legacy_main as lm

        with patch.object(lm, "_recompute_session", wraps=lm._recompute_session) as spy:
            self.patch_session(
                self.sid,
                self.UpdateSessionIn(nodes=self._nodes_payload(), roles=["cook_1", "technolog"], notes=[]),
            )
            self.patch_session(
                self.sid,
                self.UpdateSessionIn(roles=["cook_1", "technolog"], notes=[]),
            )

        self.assertEqual(spy.call_count, 1, "неизменённые roles/notes не должны триггерить recompute")

    def test_changed_roles_trigger_recompute(self):
        import app._legacy_main as lm

        with patch.object(lm, "_recompute_session", wraps=lm._recompute_session) as spy:
            self.patch_session(
                self.sid,
                self.UpdateSessionIn(nodes=self._nodes_payload(), roles=["cook_1"]),
            )
            self.patch_session(self.sid, self.UpdateSessionIn(roles=["cook_1", "technolog"]))

        self.assertEqual(spy.call_count, 2, "изменение roles должно вызывать _recompute_session")
