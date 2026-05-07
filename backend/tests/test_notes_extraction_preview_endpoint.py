import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models import Edge, Node, Question


class NotesExtractionPreviewEndpointTests(unittest.TestCase):
    def setUp(self):
        if "yaml" not in sys.modules:
            mod = types.ModuleType("yaml")
            mod.safe_dump = lambda *args, **kwargs: ""
            mod.safe_load = lambda *args, **kwargs: {}
            sys.modules["yaml"] = mod

        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_process_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_database_url = os.environ.get("DATABASE_URL")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp_sessions.name) / "notes_preview.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)

        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

        from app._legacy_main import (
            CreateSessionIn,
            NotesExtractionApplyIn,
            NotesExtractionPreviewIn,
            NotesIn,
            get_storage,
            post_notes,
            post_notes_extraction_apply,
            post_notes_extraction_preview,
            create_session,
        )
        from app.storage import get_default_org_id

        self.CreateSessionIn = CreateSessionIn
        self.NotesExtractionApplyIn = NotesExtractionApplyIn
        self.NotesExtractionPreviewIn = NotesExtractionPreviewIn
        self.NotesIn = NotesIn
        self.create_session = create_session
        self.get_storage = get_storage
        self.post_notes = post_notes
        self.post_notes_extraction_apply = post_notes_extraction_apply
        self.post_notes_extraction_preview = post_notes_extraction_preview
        self.org_id = get_default_org_id()

    def tearDown(self):
        if self.old_process_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_process_db_path
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_project_storage_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_project_storage_dir
        if self.old_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self.old_database_url
        if self.old_backend is None:
            os.environ.pop("FPC_DB_BACKEND", None)
        else:
            os.environ["FPC_DB_BACKEND"] = self.old_backend
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _create_session(self):
        created = self.create_session(self.CreateSessionIn(title="Notes preview", roles=["cook_1"], start_role="cook_1"))
        sid = str(created["id"])
        st = self.get_storage()
        sess = st.load(sid, is_admin=True)
        sess.notes = "old notes"
        sess.nodes = [Node(id="n_existing", type="step", title="Existing", actor_role="cook_1")]
        sess.edges = [Edge(from_id="n_existing", to_id="n_end")]
        sess.questions = [Question(id="q_existing", node_id="n_existing", issue_type="MISSING", question="Existing question?")]
        sess.diagram_state_version = 7
        st.save(sess, is_admin=True)
        return sid

    def _session_snapshot(self, sid):
        sess = self.get_storage().load(sid, is_admin=True)
        return {
            "notes": sess.notes,
            "roles": list(sess.roles or []),
            "start_role": sess.start_role,
            "nodes": [n.model_dump() for n in (sess.nodes or [])],
            "edges": [e.model_dump() for e in (sess.edges or [])],
            "questions": [q.model_dump() for q in (sess.questions or [])],
            "diagram_state_version": int(sess.diagram_state_version or 0),
            "bpmn_xml": str(sess.bpmn_xml or ""),
        }

    def _logs(self, *, session_id=""):
        from app.ai.execution_log import list_ai_executions

        return list_ai_executions(
            org_id=self.org_id,
            module_id="ai.process.extract_from_notes",
            session_id=session_id,
            limit=20,
            offset=0,
        ).get("items") or []

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid", "model": "deepseek-chat"})
    @patch(
        "app.ai.deepseek_client.extract_process_preview",
        return_value={
            "source": "llm",
            "result": {
                "nodes": [{"id": "n_new", "title": "New from notes", "type": "step", "actor_role": "cook_1"}],
                "edges": [{"from_id": "n_existing", "to_id": "n_new"}],
                "roles": ["cook_1"],
            },
            "warnings": [],
        },
    )
    def test_preview_returns_candidates_and_success_log_without_mutating_session(self, _mock_extract, _mock_llm):
        sid = self._create_session()
        before = self._session_snapshot(sid)

        out = self.post_notes_extraction_preview(
            sid,
            self.NotesExtractionPreviewIn(notes="cook_1: New from notes", base_diagram_state_version=7),
        )
        after = self._session_snapshot(sid)

        self.assertTrue(out.get("ok"))
        self.assertEqual(out.get("module_id"), "ai.process.extract_from_notes")
        self.assertEqual(out.get("source"), "llm")
        self.assertTrue(str(out.get("input_hash") or ""))
        self.assertEqual((out.get("candidate_nodes") or [])[0].get("id"), "n_new")
        self.assertEqual((out.get("candidate_edges") or [])[0].get("to_id"), "n_new")
        self.assertIn("candidate_questions", out)
        self.assertEqual(before, after)

        logs = self._logs(session_id=sid)
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].get("status"), "success")
        self.assertEqual(logs[0].get("module_id"), "ai.process.extract_from_notes")
        self.assertTrue(str(logs[0].get("input_hash") or ""))

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "SECRET_SHOULD_NOT_LEAK", "base_url": "https://example.invalid"})
    @patch("app.ai.deepseek_client._try_deepseek", side_effect=RuntimeError("SECRET_SHOULD_NOT_LEAK provider failed"))
    def test_deepseek_failure_returns_fallback_warning_without_secret(self, _mock_deepseek, _mock_llm):
        sid = self._create_session()
        before = self._session_snapshot(sid)

        out = self.post_notes_extraction_preview(
            sid,
            self.NotesExtractionPreviewIn(notes="повар1: нарезать овощи 5 мин"),
        )

        self.assertTrue(out.get("ok"))
        self.assertEqual(out.get("source"), "fallback")
        self.assertTrue(out.get("candidate_nodes"))
        self.assertIn("deepseek_failed", {w.get("code") for w in (out.get("warnings") or [])})
        self.assertNotIn("SECRET_SHOULD_NOT_LEAK", str(out))
        self.assertEqual(before, self._session_snapshot(sid))

    @patch("app._legacy_main.load_llm_settings", return_value={"api_key": "x", "base_url": "https://example.invalid"})
    @patch("app._legacy_main.check_ai_rate_limit")
    @patch("app.ai.deepseek_client.extract_process_preview")
    def test_rate_limit_block_returns_error_logs_and_does_not_mutate(self, mock_extract, mock_rate_limit, _mock_llm):
        mock_rate_limit.return_value = {"allowed": False, "limit": 1, "window_sec": 3600, "reset_at": 12345}
        sid = self._create_session()
        before = self._session_snapshot(sid)

        out = self.post_notes_extraction_preview(sid, self.NotesExtractionPreviewIn(notes="new notes"))

        self.assertEqual(out.get("error"), "ai_rate_limit_exceeded")
        self.assertEqual((out.get("rate_limit") or {}).get("limit"), 1)
        mock_extract.assert_not_called()
        self.assertEqual(before, self._session_snapshot(sid))
        logs = self._logs(session_id=sid)
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].get("status"), "error")
        self.assertEqual(logs[0].get("error_code"), "ai_rate_limit_exceeded")

    @patch("app.ai.deepseek_client.extract_process_preview")
    @patch("app.ai.deepseek_client.extract_process")
    def test_apply_selected_nodes_edges_only_without_ai_call(self, mock_extract, mock_preview):
        sid = self._create_session()
        before = self._session_snapshot(sid)

        out = self.post_notes_extraction_apply(
            sid,
            self.NotesExtractionApplyIn(
                base_diagram_state_version=7,
                notes="should not apply",
                roles=["should_not_apply"],
                nodes=[{"id": "n_new", "title": "Accepted node", "type": "step", "actor_role": "cook_1"}],
                edges=[{"from_id": "n_existing", "to_id": "n_new"}],
                apply_nodes_edges=True,
            ),
        )
        after = self._session_snapshot(sid)

        self.assertTrue(out.get("ok"))
        self.assertEqual(out.get("status"), "applied")
        self.assertIn("nodes", out.get("changed_keys") or [])
        self.assertIn("edges", out.get("changed_keys") or [])
        self.assertNotIn("notes", out.get("changed_keys") or [])
        self.assertNotIn("roles", out.get("changed_keys") or [])
        self.assertEqual(after["notes"], before["notes"])
        self.assertEqual(after["roles"], before["roles"])
        self.assertTrue(any(row.get("id") == "n_existing" for row in after["nodes"]))
        self.assertTrue(any(row.get("id") == "n_new" for row in after["nodes"]))
        self.assertTrue(any(row.get("from_id") == "n_existing" and row.get("to_id") == "n_end" for row in after["edges"]))
        self.assertTrue(any(row.get("from_id") == "n_existing" and row.get("to_id") == "n_new" for row in after["edges"]))
        self.assertEqual(after["diagram_state_version"], before["diagram_state_version"] + 1)
        self.assertEqual(after["bpmn_xml"], before["bpmn_xml"])
        mock_extract.assert_not_called()
        mock_preview.assert_not_called()

    @patch("app._legacy_main._legacy_load_session_scoped", return_value=(None, "", None))
    def test_apply_uses_scoped_session_loader(self, mock_scoped_load):
        sid = self._create_session()
        before = self._session_snapshot(sid)

        out = self.post_notes_extraction_apply(
            sid,
            self.NotesExtractionApplyIn(
                base_diagram_state_version=7,
                nodes=[{"id": "n_new", "title": "Accepted node", "type": "step", "actor_role": "cook_1"}],
                apply_nodes_edges=True,
            ),
        )

        self.assertEqual(out.get("error"), "not found")
        mock_scoped_load.assert_called_once()
        self.assertEqual(before, self._session_snapshot(sid))

    @patch("app.ai.deepseek_client.extract_process_preview")
    @patch("app.ai.deepseek_client.extract_process")
    def test_apply_selected_roles_start_role_only(self, mock_extract, mock_preview):
        sid = self._create_session()
        before = self._session_snapshot(sid)

        out = self.post_notes_extraction_apply(
            sid,
            self.NotesExtractionApplyIn(
                base_diagram_state_version=7,
                roles=["cook_1", "packer_1"],
                start_role="packer_1",
                apply_roles=True,
            ),
        )
        after = self._session_snapshot(sid)

        self.assertTrue(out.get("ok"))
        self.assertIn("roles", out.get("changed_keys") or [])
        self.assertIn("start_role", out.get("changed_keys") or [])
        self.assertNotIn("nodes", out.get("changed_keys") or [])
        self.assertNotIn("edges", out.get("changed_keys") or [])
        self.assertEqual(after["roles"], ["cook_1", "packer_1"])
        self.assertEqual(after["start_role"], "packer_1")
        self.assertEqual(after["nodes"], before["nodes"])
        self.assertEqual(after["edges"], before["edges"])
        self.assertEqual(after["diagram_state_version"], before["diagram_state_version"] + 1)
        mock_extract.assert_not_called()
        mock_preview.assert_not_called()

    def test_apply_selected_questions_only(self):
        sid = self._create_session()
        before = self._session_snapshot(sid)
        selected_question = {
            "id": "q_selected",
            "node_id": "n_existing",
            "issue_type": "MISSING",
            "question": "Selected question?",
        }

        out = self.post_notes_extraction_apply(
            sid,
            self.NotesExtractionApplyIn(
                base_diagram_state_version=7,
                questions=[selected_question],
                apply_questions=True,
            ),
        )
        after = self._session_snapshot(sid)

        self.assertTrue(out.get("ok"))
        self.assertEqual(out.get("changed_keys"), ["questions"])
        self.assertEqual([row.get("id") for row in after["questions"]], ["q_selected"])
        self.assertEqual(after["notes"], before["notes"])
        self.assertEqual(after["nodes"], before["nodes"])
        self.assertEqual(after["edges"], before["edges"])
        self.assertEqual(after["diagram_state_version"], before["diagram_state_version"] + 1)

    def test_apply_notes_ignored_when_apply_notes_false(self):
        sid = self._create_session()
        before = self._session_snapshot(sid)

        out = self.post_notes_extraction_apply(
            sid,
            self.NotesExtractionApplyIn(
                base_diagram_state_version=7,
                notes="new notes should not be saved",
                roles=["cook_1", "packer_1"],
                start_role="cook_1",
                apply_notes=False,
                apply_roles=True,
            ),
        )
        after = self._session_snapshot(sid)

        self.assertTrue(out.get("ok"))
        self.assertEqual(after["notes"], before["notes"])
        self.assertIn("roles", out.get("changed_keys") or [])
        self.assertNotIn("notes", out.get("changed_keys") or [])

    def test_apply_requires_base_diagram_state_version(self):
        sid = self._create_session()
        before = self._session_snapshot(sid)

        with self.assertRaises(HTTPException) as ctx:
            self.post_notes_extraction_apply(
                sid,
                self.NotesExtractionApplyIn(
                    nodes=[{"id": "n_new", "title": "Accepted node", "type": "step"}],
                    apply_nodes_edges=True,
                ),
            )

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual((ctx.exception.detail or {}).get("code"), "DIAGRAM_STATE_BASE_VERSION_REQUIRED")
        self.assertEqual(before, self._session_snapshot(sid))

    def test_apply_rejects_stale_base_diagram_state_version(self):
        sid = self._create_session()
        before = self._session_snapshot(sid)

        with self.assertRaises(HTTPException) as ctx:
            self.post_notes_extraction_apply(
                sid,
                self.NotesExtractionApplyIn(
                    base_diagram_state_version=6,
                    nodes=[{"id": "n_new", "title": "Accepted node", "type": "step"}],
                    apply_nodes_edges=True,
                ),
            )

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual((ctx.exception.detail or {}).get("code"), "DIAGRAM_STATE_CONFLICT")
        self.assertEqual(before, self._session_snapshot(sid))

    @patch(
        "app.ai.deepseek_client.extract_process",
        return_value={
            "nodes": [{"id": "n_legacy", "title": "Legacy", "type": "step"}],
            "edges": [],
            "roles": ["cook_1"],
        },
    )
    def test_legacy_notes_endpoint_still_mutates_existing_contract(self, _mock_extract):
        sid = self._create_session()

        out = self.post_notes(sid, self.NotesIn(notes="legacy write", base_diagram_state_version=7))

        self.assertEqual(out.get("notes"), "legacy write")
        self.assertEqual(int(out.get("diagram_state_version") or 0), 8)
        reloaded = self.get_storage().load(sid, is_admin=True)
        self.assertEqual(str(reloaded.notes or ""), "legacy write")
        self.assertTrue(any(n.id == "n_legacy" for n in (reloaded.nodes or [])))


if __name__ == "__main__":
    unittest.main()
