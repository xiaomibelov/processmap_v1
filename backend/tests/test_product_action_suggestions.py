import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class ProductActionSuggestionsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_db_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_database_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "processmap.sqlite3")
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        from app.db.config import get_db_runtime_config

        get_db_runtime_config.cache_clear()
        try:
            import app.storage as storage_module

            storage_module._SCHEMA_READY = False
            storage_module._SCHEMA_DB_FILE = ""
            storage_module._PG_POOL = None
        except Exception:
            pass

        from app.auth import create_user
        from app.routers.product_action_suggestions import (
            ApplySuggestionsIn,
            PatchRagReadinessIn,
            SuggestionIn,
            apply_approved_suggestions,
            create_or_update_suggestion,
            get_rag_readiness,
            list_suggestions,
            transition_rag_readiness,
        )
        from app.storage import (
            get_default_org_id,
            get_project_storage,
            get_storage,
            list_org_workspaces,
        )

        self.SuggestionIn = SuggestionIn
        self.ApplySuggestionsIn = ApplySuggestionsIn
        self.PatchRagReadinessIn = PatchRagReadinessIn
        self.list_suggestions = list_suggestions
        self.create_or_update_suggestion = create_or_update_suggestion
        self.apply_approved_suggestions = apply_approved_suggestions
        self.get_rag_readiness = get_rag_readiness
        self.transition_rag_readiness = transition_rag_readiness
        self.get_storage = get_storage
        self.get_project_storage = get_project_storage
        self.list_org_workspaces = list_org_workspaces

        self.org_id = get_default_org_id()
        self.admin = create_user("suggestions-admin@local", "admin", is_admin=False)
        self.admin_id = str(self.admin.get("id") or "")
        self._insert_membership(self.org_id, self.admin_id, "org_admin")

        self.workspace_id = str(self.list_org_workspaces(self.org_id)[0].get("id") or "")
        self.project_id = self.get_project_storage().create(
            "Suggestions Project", {}, user_id=self.admin_id, org_id=self.org_id, is_admin=True
        )
        self.session_id = self.get_storage().create(
            "Suggestions Session",
            roles=["Повар"],
            project_id=self.project_id,
            org_id=self.org_id,
            is_admin=True,
        )

    def tearDown(self):
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        if self.old_db_backend is None:
            os.environ.pop("FPC_DB_BACKEND", None)
        else:
            os.environ["FPC_DB_BACKEND"] = self.old_db_backend
        if self.old_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self.old_database_url
        try:
            from app.db.config import get_db_runtime_config

            get_db_runtime_config.cache_clear()
            import app.storage as storage_module

            storage_module._SCHEMA_READY = False
            storage_module._SCHEMA_DB_FILE = ""
            storage_module._PG_POOL = None
        except Exception:
            pass
        self.tmp.cleanup()

    def _db_path(self) -> Path:
        return Path(self.tmp.name) / "processmap.sqlite3"

    def _insert_membership(self, org_id: str, user_id: str, role: str):
        _ = self.get_storage()
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                """
                INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at)
                VALUES (?, ?, ?, strftime('%s','now'))
                """,
                [org_id, user_id, role],
            )
            con.execute(
                "UPDATE org_memberships SET role = ? WHERE org_id = ? AND user_id = ?",
                [role, org_id, user_id],
            )
            con.commit()

    def _req(self, user: dict):
        return _DummyRequest(user, active_org_id=self.org_id)

    def _set_diagram_version(self, version: int):
        storage = self.get_storage()
        session = storage.load(self.session_id, org_id=self.org_id, is_admin=True)
        session.diagram_state_version = version
        storage.save(session, org_id=self.org_id, is_admin=True)

    def _create_suggestion(self, *, status: str = "pending", action: dict = None):
        action = action or {"product_name": "Курица", "action_type": "нарезка"}
        return self.create_or_update_suggestion(
            self.session_id,
            self.SuggestionIn(status=status, action=action),
            self._req(self.admin),
        )

    def test_create_and_list_suggestion(self):
        created = self._create_suggestion(status="pending")
        self.assertTrue(created.get("success"))
        self.assertIn("data", created)
        self.assertEqual(created["data"]["status"], "pending")
        self.assertEqual(created["data"]["action"]["product_name"], "Курица")

        out = self.list_suggestions(self.session_id, self._req(self.admin))
        self.assertTrue(out.get("success"))
        self.assertEqual(len(out["data"]), 1)
        self.assertEqual(out["meta"]["counts"]["pending"], 1)
        self.assertEqual(out["meta"]["counts"]["total"], 1)

    def test_update_suggestion(self):
        created = self._create_suggestion(status="pending")
        suggestion_id = created["data"]["id"]

        updated = self.create_or_update_suggestion(
            self.session_id,
            self.SuggestionIn(id=suggestion_id, status="approved"),
            self._req(self.admin),
        )
        self.assertEqual(updated["data"]["status"], "approved")

        out = self.list_suggestions(self.session_id, self._req(self.admin))
        self.assertEqual(out["meta"]["counts"]["approved"], 1)
        self.assertEqual(out["meta"]["counts"]["pending"], 0)

    def test_apply_missing_base_version_returns_409(self):
        self._create_suggestion(status="approved")
        with self.assertRaises(HTTPException) as ctx:
            self.apply_approved_suggestions(
                self.session_id,
                self.ApplySuggestionsIn(),
                self._req(self.admin),
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail.get("code"), "DIAGRAM_STATE_BASE_VERSION_REQUIRED")

    def test_apply_stale_base_version_returns_409(self):
        self._set_diagram_version(5)
        self._create_suggestion(status="approved")
        with self.assertRaises(HTTPException) as ctx:
            self.apply_approved_suggestions(
                self.session_id,
                self.ApplySuggestionsIn(base_diagram_state_version=3),
                self._req(self.admin),
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail.get("code"), "DIAGRAM_STATE_CONFLICT")
        self.assertEqual(ctx.exception.detail.get("server_current_version"), 5)

    def test_apply_approved_suggestions_success(self):
        self._set_diagram_version(5)
        self._create_suggestion(
            status="approved",
            action={
                "product_name": "Курица",
                "product_group": "Сэндвичи",
                "action_type": "нарезка",
                "action_object": "филе",
                "step_id": "step_1",
            },
        )

        result = self.apply_approved_suggestions(
            self.session_id,
            self.ApplySuggestionsIn(base_diagram_state_version=5),
            self._req(self.admin),
        )
        self.assertTrue(result.get("success"))
        self.assertEqual(result["data"]["applied_count"], 1)
        self.assertEqual(result["data"]["new_diagram_state_version"], 6)
        self.assertEqual(result["data"]["rag_readiness_status"], "ready")

        storage = self.get_storage()
        session = storage.load(self.session_id, org_id=self.org_id, is_admin=True)
        actions = session.interview.get("analysis", {}).get("product_actions", [])
        self.assertEqual(len(actions), 1)
        self.assertEqual(actions[0]["product_name"], "Курица")
        self.assertEqual(actions[0]["source"], "llm")
        self.assertEqual(session.diagram_state_version, 6)
        self.assertEqual(session.rag_readiness_status, "ready")

        # Approved suggestions are deleted after application.
        out = self.list_suggestions(self.session_id, self._req(self.admin))
        self.assertEqual(len(out["data"]), 0)

    def test_rag_readiness_get_and_transition(self):
        out = self.get_rag_readiness(self.session_id, self._req(self.admin))
        self.assertTrue(out.get("success"))
        self.assertEqual(out["data"]["rag_readiness_status"], "not_ready")
        self.assertIsNone(out["data"]["rag_queued_at"])

        storage = self.get_storage()
        session = storage.load(self.session_id, org_id=self.org_id, is_admin=True)
        session.rag_readiness_status = "ready"
        storage.save(session, org_id=self.org_id, is_admin=True)

        queued = self.transition_rag_readiness(
            self.session_id,
            self.PatchRagReadinessIn(rag_readiness_status="queued"),
            self._req(self.admin),
        )
        self.assertTrue(queued.get("success"))
        self.assertEqual(queued["data"]["rag_readiness_status"], "queued")
        self.assertIsNotNone(queued["data"]["rag_queued_at"])

    def test_invalid_rag_transition_rejected(self):
        out = self.get_rag_readiness(self.session_id, self._req(self.admin))
        self.assertEqual(out["data"]["rag_readiness_status"], "not_ready")

        with self.assertRaises(HTTPException) as ctx:
            self.transition_rag_readiness(
                self.session_id,
                self.PatchRagReadinessIn(rag_readiness_status="queued"),
                self._req(self.admin),
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail.get("code"), "RAG_READINESS_INVALID_TRANSITION")

    def test_unknown_session_returns_404(self):
        with self.assertRaises(HTTPException) as ctx:
            self.list_suggestions("unknown_session", self._req(self.admin))
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail.get("code"), "not_found")


if __name__ == "__main__":
    unittest.main()
