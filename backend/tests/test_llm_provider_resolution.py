"""LLM provider resolution unit tests for sqlite backend.

Uses app.storage sqlite connection (no external Postgres) and creates the
llm_* tables locally. Covers llm_store.effective_providers_with_key semantics:
- org-scoped provider is preferred;
- fallback to org_default when org has none;
- empty list when neither org nor org_default has an enabled provider with key.
"""
import os
import sqlite3
import tempfile
import unittest


class LLMProviderResolutionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_db_backend = os.environ.get("FPC_DB_BACKEND")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"

        # Force a fresh storage module import for this test process.
        import app.storage as _st

        _st._SCHEMA_READY = False
        _st._SCHEMA_DB_FILE = ""
        _st._PG_POOL = None

        from app.ai import llm_store

        self.llm_store = llm_store
        self._create_llm_tables()

    def tearDown(self):
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_db_backend is None:
            os.environ.pop("FPC_DB_BACKEND", None)
        else:
            os.environ["FPC_DB_BACKEND"] = self.old_db_backend
        self.tmp.cleanup()

    def _db_path(self):
        import app.storage as _st

        return _st._db_path()

    def _create_llm_tables(self):
        # SQLite-compatible copies of migration 012 tables.
        ddl = """
        CREATE TABLE IF NOT EXISTS llm_providers (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL DEFAULT 'org_default',
            name TEXT NOT NULL,
            base_url TEXT NOT NULL,
            api_key TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 100,
            enabled BOOLEAN NOT NULL DEFAULT true,
            created_by TEXT,
            created_at BIGINT,
            updated_by TEXT,
            updated_at BIGINT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_providers_org_name
            ON llm_providers(org_id, name);

        CREATE TABLE IF NOT EXISTS llm_prompts (
            id TEXT PRIMARY KEY,
            feature TEXT NOT NULL,
            version INTEGER NOT NULL,
            system TEXT NOT NULL DEFAULT '',
            template TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'draft',
            max_tokens INTEGER NOT NULL DEFAULT 2000,
            model_class TEXT NOT NULL DEFAULT 'primary',
            updated_by TEXT,
            updated_at BIGINT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_prompts_feature_version
            ON llm_prompts(feature, version);
        CREATE INDEX IF NOT EXISTS idx_llm_prompts_feature_status
            ON llm_prompts(feature, status);

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
        );
        CREATE INDEX IF NOT EXISTS idx_llm_usage_org_feature_ts
            ON llm_usage(org_id, feature, ts);
        CREATE INDEX IF NOT EXISTS idx_llm_usage_feature_ts
            ON llm_usage(feature, ts);

        CREATE TABLE IF NOT EXISTS llm_feature_flags (
            feature TEXT PRIMARY KEY,
            enabled BOOLEAN NOT NULL DEFAULT true,
            daily_token_limit INTEGER NOT NULL DEFAULT 200000,
            updated_by TEXT,
            updated_at BIGINT
        );

        CREATE TABLE IF NOT EXISTS llm_models (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL DEFAULT 'org_default',
            provider TEXT,
            model_name TEXT NOT NULL,
            display_name TEXT,
            enabled BOOLEAN NOT NULL DEFAULT true,
            is_default BOOLEAN NOT NULL DEFAULT false,
            params TEXT NOT NULL DEFAULT '{}',
            created_by TEXT,
            created_at BIGINT,
            updated_by TEXT,
            updated_at BIGINT
        );

        CREATE TABLE IF NOT EXISTS llm_feature_models (
            feature TEXT NOT NULL,
            org_id TEXT NOT NULL DEFAULT 'org_default',
            model_id TEXT NOT NULL,
            updated_by TEXT,
            updated_at BIGINT,
            PRIMARY KEY (feature, org_id)
        );
        """
        with sqlite3.connect(str(self._db_path())) as con:
            con.executescript(ddl)
            con.commit()

    def _insert_provider(self, *, org_id, name, api_key, model="m", priority=100, enabled=True):
        import uuid

        pid = f"llmprov_{uuid.uuid4().hex[:12]}"
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                """
                INSERT INTO llm_providers
                (id, org_id, name, base_url, api_key, model, priority, enabled, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (pid, org_id, name, "https://api.test", api_key, model, priority, enabled),
            )
            con.commit()
        return pid

    def test_org_provider_preferred_over_org_default(self):
        self._insert_provider(org_id="org_default", name="default-p", api_key="key-d")
        own_pid = self._insert_provider(org_id="org_a", name="own-p", api_key="key-o")
        result = self.llm_store.effective_providers_with_key("org_a")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["id"], own_pid)
        self.assertEqual(result[0]["api_key"], "key-o")

    def test_falls_back_to_org_default_when_org_has_no_provider(self):
        default_pid = self._insert_provider(org_id="org_default", name="default-p", api_key="key-d")
        result = self.llm_store.effective_providers_with_key("org_without_own")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["id"], default_pid)

    def test_empty_when_no_provider_anywhere(self):
        result = self.llm_store.effective_providers_with_key("org_empty")
        self.assertEqual(result, [])

    def test_disabled_or_empty_key_providers_are_excluded(self):
        self._insert_provider(org_id="org_b", name="disabled-p", api_key="key", enabled=False)
        self._insert_provider(org_id="org_b", name="empty-key-p", api_key="", enabled=True)
        result = self.llm_store.effective_providers_with_key("org_b")
        self.assertEqual(result, [])


if __name__ == "__main__":
    unittest.main()
