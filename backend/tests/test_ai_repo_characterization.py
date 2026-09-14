"""Characterization tests for ai storage repository methods migrated to the
generic base.py CRUD layer (refactor/storage-base-repository-v1, step 3).

Covers: list/count ai_execution_log with eq/range/org filters,
get_ai_prompt_version, create_ai_prompt_draft, update_agent_conversation_summary.
Bootstrap mirrors test_ai_execution_log_foundation.py: tmpdir sqlite DB.
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class AiRepoCharacterizationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_process_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_database_url = os.environ.get("DATABASE_URL")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "ai_repo_char.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)

        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

        from app.domains.storage.ai import repository as ai_repo
        from app.domains.storage.compat.repository import _connect, _ensure_agent_tables

        self.ai_repo = ai_repo
        self._connect = _connect
        self._ensure_agent_tables = _ensure_agent_tables
        self.org_id = "org_ai_char"
        self.other_org_id = "org_ai_char_foreign"

        for i in range(5):
            self.ai_repo.append_ai_execution_log(
                execution_id=f"exec_char_{i}",
                module_id="module_a" if i < 3 else "module_b",
                actor_user_id="user_1" if i % 2 == 0 else "user_2",
                org_id=self.org_id if i < 4 else self.other_org_id,
                workspace_id="ws_1",
                status="success" if i % 2 == 0 else "error",
                usage={"prompt_tokens": 10 + i},
                created_at=1_000 + i * 100,
                finished_at=1_050 + i * 100,
            )

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
        self.tmp.cleanup()

    # --- list_ai_execution_log / count_ai_execution_log -----------------------

    def test_list_without_filters_returns_all_ordered_desc(self):
        items = self.ai_repo.list_ai_execution_log()
        self.assertEqual(len(items), 5)
        created = [item["created_at"] for item in items]
        self.assertEqual(created, sorted(created, reverse=True))

    def test_list_org_scoping(self):
        items = self.ai_repo.list_ai_execution_log(org_id=self.org_id)
        self.assertEqual(len(items), 4)
        self.assertTrue(all(item["org_id"] == self.org_id for item in items))
        self.assertEqual(
            self.ai_repo.count_ai_execution_log(org_id=self.org_id), 4
        )

    def test_list_eq_filters_module_status_actor(self):
        items = self.ai_repo.list_ai_execution_log(
            org_id=self.org_id, module_id="module_a", status="success"
        )
        self.assertEqual(len(items), 2)
        self.assertTrue(
            all(item["module_id"] == "module_a" and item["status"] == "success" for item in items)
        )
        self.assertEqual(
            self.ai_repo.count_ai_execution_log(
                org_id=self.org_id, module_id="module_a", status="success"
            ),
            2,
        )

    def test_list_actor_and_scope_filters(self):
        items = self.ai_repo.list_ai_execution_log(
            actor_user_id="user_2", workspace_id="ws_1"
        )
        self.assertEqual(len(items), 2)
        self.assertTrue(all(item["actor_user_id"] == "user_2" for item in items))

    def test_list_created_range_filter(self):
        items = self.ai_repo.list_ai_execution_log(
            created_from=1_100, created_to=1_300
        )
        self.assertEqual([item["created_at"] for item in items], [1_300, 1_200, 1_100])
        self.assertEqual(
            self.ai_repo.count_ai_execution_log(created_from=1_100, created_to=1_300),
            3,
        )

    def test_list_limit_offset_pagination(self):
        page1 = self.ai_repo.list_ai_execution_log(limit=2, offset=0)
        page2 = self.ai_repo.list_ai_execution_log(limit=2, offset=2)
        self.assertEqual(len(page1), 2)
        self.assertEqual(len(page2), 2)
        ids1 = {item["execution_id"] for item in page1}
        ids2 = {item["execution_id"] for item in page2}
        self.assertFalse(ids1 & ids2)

    def test_list_combines_org_range_and_pagination(self):
        items = self.ai_repo.list_ai_execution_log(
            org_id=self.org_id, created_from=1_100, limit=1, offset=0
        )
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["created_at"], 1_300)
        self.assertEqual(items[0]["org_id"], self.org_id)

    # --- get_ai_prompt_version -------------------------------------------------

    def test_get_ai_prompt_version_roundtrip(self):
        draft = self.ai_repo.create_ai_prompt_draft(
            module_id="char_module",
            version="v1",
            template="Шаблон {{name}}",
            variables_schema={"name": {"type": "string"}},
            output_schema={"type": "object"},
            created_by="user_1",
            scope_level="org",
            scope_id=self.org_id,
            created_at=42,
        )
        got = self.ai_repo.get_ai_prompt_version(draft["prompt_id"])
        self.assertIsNotNone(got)
        self.assertEqual(got["prompt_id"], draft["prompt_id"])
        self.assertEqual(got["module_id"], "char_module")
        self.assertEqual(got["version"], "v1")
        self.assertEqual(got["status"], "draft")
        self.assertEqual(got["scope_level"], "org")
        self.assertEqual(got["scope_id"], self.org_id)
        self.assertEqual(got["template"], "Шаблон {{name}}")
        self.assertEqual(got["variables_schema"], {"name": {"type": "string"}})
        self.assertEqual(got["output_schema"], {"type": "object"})
        self.assertEqual(got["created_by"], "user_1")
        self.assertEqual(got["created_at"], 42)
        self.assertEqual(got["updated_at"], 42)
        self.assertEqual(got["activated_at"], 0)
        self.assertEqual(got["archived_at"], 0)

    def test_get_ai_prompt_version_unknown_returns_none(self):
        self.assertIsNone(self.ai_repo.get_ai_prompt_version("missing_prompt"))
        self.assertIsNone(self.ai_repo.get_ai_prompt_version(""))

    # --- create_ai_prompt_draft ------------------------------------------------

    def test_create_ai_prompt_draft_defaults_and_global_scope(self):
        draft = self.ai_repo.create_ai_prompt_draft(
            module_id="char_module_2",
            version="v1",
            template="Тело",
        )
        self.assertEqual(draft["status"], "draft")
        self.assertEqual(draft["scope_level"], "global")
        self.assertEqual(draft["scope_id"], "")
        self.assertEqual(draft["variables_schema"], {})
        self.assertEqual(draft["output_schema"], {})
        self.assertTrue(draft["prompt_id"].startswith("ai_prompt_"))
        self.assertGreater(draft["created_at"], 0)
        # персистентность: перечитка из БД
        got = self.ai_repo.get_ai_prompt_version(draft["prompt_id"])
        self.assertEqual(got["template"], "Тело")

    def test_create_ai_prompt_draft_explicit_id_and_global_scope_id_reset(self):
        draft = self.ai_repo.create_ai_prompt_draft(
            module_id="char_module_3",
            version="v1",
            template="Тело",
            prompt_id="char_prompt_explicit",
            scope_level="global",
            scope_id="should_be_reset",
        )
        self.assertEqual(draft["prompt_id"], "char_prompt_explicit")
        self.assertEqual(draft["scope_id"], "")

    def test_create_ai_prompt_draft_requires_fields(self):
        with self.assertRaises(ValueError):
            self.ai_repo.create_ai_prompt_draft(
                module_id="", version="v1", template="Тело"
            )
        with self.assertRaises(ValueError):
            self.ai_repo.create_ai_prompt_draft(
                module_id="m", version="", template="Тело"
            )
        with self.assertRaises(ValueError):
            self.ai_repo.create_ai_prompt_draft(
                module_id="m", version="v1", template="   "
            )

    def test_create_ai_prompt_draft_invalid_scope_level_rejected(self):
        with self.assertRaises(ValueError):
            self.ai_repo.create_ai_prompt_draft(
                module_id="m",
                version="v1",
                template="Тело",
                scope_level="galaxy",
            )

    # --- update_agent_conversation_summary -------------------------------------

    def _insert_conversation(self, conversation_id: str, summary=None):
        self._ensure_agent_tables()
        with self._connect() as con:
            con.execute(
                """
                INSERT INTO agent_conversations
                    (id, org_id, session_id, user_id, created_at, updated_at, summary)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                [conversation_id, self.org_id, "sess_1", "user_1", 100, 100, summary],
            )
            con.commit()

    def _fetch_summary(self, conversation_id: str):
        with self._connect() as con:
            row = con.execute(
                "SELECT summary FROM agent_conversations WHERE id = ?",
                [conversation_id],
            ).fetchone()
        return row["summary"] if row else None

    def test_update_agent_conversation_summary_sets_and_overwrites(self):
        self._insert_conversation("conv_char_1")
        self.ai_repo.update_agent_conversation_summary("conv_char_1", "  Итог  ")
        self.assertEqual(self._fetch_summary("conv_char_1"), "Итог")
        self.ai_repo.update_agent_conversation_summary("conv_char_1", "Новый итог")
        self.assertEqual(self._fetch_summary("conv_char_1"), "Новый итог")

    def test_update_agent_conversation_summary_empty_becomes_null(self):
        self._insert_conversation("conv_char_2", summary="старое")
        self.ai_repo.update_agent_conversation_summary("conv_char_2", "")
        self.assertIsNone(self._fetch_summary("conv_char_2"))

    def test_update_agent_conversation_summary_noop_on_empty_id(self):
        self.ai_repo.update_agent_conversation_summary("", "Итог")
        self.assertIsNone(self._fetch_summary(""))


if __name__ == "__main__":
    unittest.main()
