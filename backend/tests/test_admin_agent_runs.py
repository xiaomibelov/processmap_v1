import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str, is_admin: bool = False):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id, org_memberships=[])
        self.headers = {}
        self._is_admin = is_admin


def _make_user(is_admin: bool = False, org_id: str = "org_default"):
    from app.auth import create_user

    user = create_user(f"admin_{'plat' if is_admin else 'org'}@local", "adminpass", is_admin=is_admin)
    return user


class AdminAgentRunsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_db_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "admin_agent_runs.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        import app.storage as storage
        importlib = __import__("importlib")
        importlib.reload(storage)
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        storage._AGENT_TABLES_READY = False
        storage._AGENT_TABLES_DB_FILE = ""

        from app.auth import create_user
        from app.storage import get_default_org_id

        self.org_id = get_default_org_id()
        self.admin_user = create_user("admin@local", "adminpass", is_admin=True)
        self.admin_id = str(self.admin_user.get("id") or "")

        # Ensure agent tables exist (both memory_store and storage schemas).
        from app.agent import memory_store
        memory_store._ensure_agent_schema()
        storage._ensure_agent_tables()

        # Ensure llm_usage exists for token aggregation (normally created by migration 012).
        with storage._connect() as con:
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS llm_usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    org_id TEXT,
                    feature TEXT NOT NULL,
                    model TEXT,
                    provider_id TEXT,
                    prompt_tokens INTEGER NOT NULL DEFAULT 0,
                    completion_tokens INTEGER NOT NULL DEFAULT 0,
                    cached INTEGER NOT NULL DEFAULT 0,
                    user_id TEXT,
                    project_id TEXT,
                    session_id TEXT,
                    latency_ms INTEGER,
                    status TEXT NOT NULL DEFAULT 'ok',
                    ts BIGINT NOT NULL
                )
                """
            )
            con.execute(
                "CREATE INDEX IF NOT EXISTS idx_llm_usage_session_id ON llm_usage(session_id)"
            )
            con.commit()

        from app.routers.admin import admin_agent_runs, admin_agent_run_detail
        self.admin_agent_runs = admin_agent_runs
        self.admin_agent_run_detail = admin_agent_run_detail
        self.request = _DummyRequest(self.admin_user, active_org_id=self.org_id, is_admin=True)

    def tearDown(self):
        for key, old in [
            ("PROCESS_DB_PATH", self.old_db_path),
            ("PROCESS_STORAGE_DIR", self.old_storage_dir),
            ("FPC_DB_BACKEND", self.old_backend),
            ("DATABASE_URL", self.old_db_url),
        ]:
            if old is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old
        self.tmp.cleanup()

    def _create_conversation(self, session_id: str, user_id: str, org_id: str, *, updated_at: int):
        from app.agent.memory_store import get_or_create_conversation
        from app.storage import _connect

        conv_id = get_or_create_conversation(session_id, user_id, org_id, now_ms=updated_at)
        with _connect() as con:
            con.execute(
                "UPDATE agent_conversations SET updated_at = ? WHERE id = ?",
                [updated_at, conv_id],
            )
            con.commit()
        return conv_id

    def _add_turn(self, session_id: str, user_id: str, org_id: str, role: str, text: str, *, now_ms: int):
        from app.agent.memory_store import append_turn

        return append_turn(
            session_id,
            user_id,
            org_id,
            role,
            content_json={"text": text},
            now_ms=now_ms,
        )

    def _add_llm_usage(self, session_id: str, tokens: int):
        from app.ai import llm_store

        llm_store.record_usage(
            org_id=self.org_id,
            feature="processman_agent",
            model="deepseek-chat",
            prompt_tokens=tokens // 2,
            completion_tokens=tokens - tokens // 2,
            session_id=session_id,
            ts=1700000000,
        )

    def _add_pending_edit(self, session_id: str, turn_id: str, status: str):
        from app.storage import _connect
        import uuid as _uuid

        with _connect() as con:
            con.execute(
                """
                INSERT INTO agent_pending_edits
                (id, org_id, session_id, turn_id, edit_plan_json, status, expires_at, created_at, base_diagram_state_version)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    f"ped_{_uuid.uuid4().hex[:12]}",
                    self.org_id,
                    session_id,
                    turn_id,
                    "{}",
                    status,
                    1700000100,
                    1700000000,
                    0,
                ],
            )
            con.commit()

    def test_empty_conversations(self):
        result = self.admin_agent_runs(self.request)
        self.assertTrue(result.get("ok"))
        self.assertEqual(result.get("items"), [])
        self.assertEqual(result.get("count"), 0)

    def test_active_conversation(self):
        import time

        now = int(time.time())
        session_id = "sess_active"
        user_id = "user_1"
        conv_id = self._create_conversation(session_id, user_id, self.org_id, updated_at=now)
        self._add_turn(session_id, user_id, self.org_id, "user", "привет", now_ms=now)
        self._add_turn(session_id, user_id, self.org_id, "assistant", "здравствуй", now_ms=now)
        self._add_llm_usage(session_id, 200)
        result = self.admin_agent_runs(self.request)
        self.assertTrue(result.get("ok"))
        self.assertEqual(result.get("count"), 1)
        item = result["items"][0]
        self.assertEqual(item["conversation_id"], conv_id)
        self.assertEqual(item["session_id"], session_id)
        self.assertEqual(item["status"], "active")
        self.assertEqual(item["turn_count"], 2)
        self.assertEqual(item["total_tokens"], 200)
        self.assertEqual(item["applied_count"], 0)
        self.assertEqual(item["rejected_count"], 0)

    def test_closed_conversation_after_24h(self):
        import time

        now = int(time.time())
        old = now - 25 * 3600
        session_id = "sess_old"
        user_id = "user_1"
        conv_id = self._create_conversation(session_id, user_id, self.org_id, updated_at=old)
        self._add_turn(session_id, user_id, self.org_id, "user", "вопрос", now_ms=old)
        result = self.admin_agent_runs(self.request)
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["items"][0]["status"], "closed")
        self.assertEqual(result["items"][0]["conversation_id"], conv_id)

    def test_applied_and_rejected_counts(self):
        import time

        now = int(time.time())
        session_id = "sess_actions"
        user_id = "user_1"
        conv_id = self._create_conversation(session_id, user_id, self.org_id, updated_at=now)
        turn_id = self._add_turn(session_id, user_id, self.org_id, "assistant", "предлагаю правку", now_ms=now)
        self._add_pending_edit(session_id, turn_id, "applied")
        self._add_pending_edit(session_id, turn_id, "rejected")
        result = self.admin_agent_runs(self.request)
        item = result["items"][0]
        self.assertEqual(item["applied_count"], 1)
        self.assertEqual(item["rejected_count"], 1)

    def test_detail_generates_summary_when_closed(self):
        import time

        now = int(time.time())
        old = now - 25 * 3600
        session_id = "sess_summary"
        user_id = "user_1"
        conv_id = self._create_conversation(session_id, user_id, self.org_id, updated_at=old)
        self._add_turn(session_id, user_id, self.org_id, "user", "что такое BPMN?", now_ms=old)
        self._add_turn(session_id, user_id, self.org_id, "assistant", "BPMN — это нотация.", now_ms=old + 1)

        with patch("app.routers.admin.complete") as mock_complete:
            mock_complete.return_value = {"ok": True, "text": "Пользователь интересовался BPMN."}
            result = self.admin_agent_run_detail(self.request, conv_id)

        self.assertTrue(result.get("ok"))
        item = result["item"]
        self.assertEqual(item["conversation_id"], conv_id)
        self.assertEqual(item["status"], "closed")
        self.assertEqual(item["summary"], "Пользователь интересовался BPMN.")
        self.assertFalse(item["summary_missing"])
        self.assertEqual(len(item["turns"]), 2)
        mock_complete.assert_called_once()

    def test_detail_summary_missing_on_llm_error(self):
        import time

        now = int(time.time())
        old = now - 25 * 3600
        session_id = "sess_summary_fail"
        user_id = "user_1"
        conv_id = self._create_conversation(session_id, user_id, self.org_id, updated_at=old)
        self._add_turn(session_id, user_id, self.org_id, "user", "вопрос", now_ms=old)

        with patch("app.routers.admin.complete") as mock_complete:
            mock_complete.return_value = {"ok": False, "status": "no_provider"}
            result = self.admin_agent_run_detail(self.request, conv_id)

        self.assertTrue(result.get("ok"))
        item = result["item"]
        self.assertIsNone(item["summary"])
        self.assertTrue(item["summary_missing"])

    def test_org_admin_sees_only_own_org(self):
        from app.auth import create_user
        from app.storage import _connect

        org_user = create_user("orgadmin@local", "adminpass", is_admin=False)
        # Create memberships for the default org and a second org.
        with _connect() as con:
            con.execute(
                "INSERT INTO orgs (id, name, created_at) VALUES (?, ?, ?)",
                ["org_other", "Other", 1700000000],
            )
            con.execute(
                "INSERT INTO org_memberships (org_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
                [self.org_id, org_user.get("id"), "org_admin", 1700000000],
            )
            con.execute(
                "INSERT INTO org_memberships (org_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
                ["org_other", org_user.get("id"), "org_admin", 1700000000],
            )
            con.commit()

        import time

        now = int(time.time())
        self._create_conversation("sess_default", "user_1", self.org_id, updated_at=now)
        self._create_conversation("sess_other", "user_2", "org_other", updated_at=now)

        org_request = _DummyRequest(org_user, active_org_id=self.org_id, is_admin=False)
        result = self.admin_agent_runs(org_request)
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["items"][0]["session_id"], "sess_default")

    def test_platform_admin_can_filter_by_org(self):
        from app.storage import _connect

        with _connect() as con:
            con.execute(
                "INSERT INTO orgs (id, name, created_at) VALUES (?, ?, ?)",
                ["org_other", "Other", 1700000000],
            )
            con.commit()

        import time

        now = int(time.time())
        self._create_conversation("sess_default", "user_1", self.org_id, updated_at=now)
        self._create_conversation("sess_other", "user_2", "org_other", updated_at=now)

        result = self.admin_agent_runs(self.request, org_id="org_other")
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["items"][0]["session_id"], "sess_other")


if __name__ == "__main__":
    unittest.main()
