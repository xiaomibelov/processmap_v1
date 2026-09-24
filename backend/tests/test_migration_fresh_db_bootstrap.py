"""F4 — fresh DB: db_bootstrap поднимает пустую БД с нуля до head.

Находка release/tobe-stage-wave-2026-09-24 №4: alembic-цепочка main не
поднималась с нуля на пустой БД — 001 делает ALTER users без CREATE (users
создаёт runtime-DDL `_ensure_schema` вне alembic), fresh-volume старты api
уходили в degraded-старт, /api/llm/status 500. Контур: fix/alembic-fresh-db-v1.

Гейт: полностью пустая scratch-БД (без alembic_version и маркеров) →
db_bootstrap → rc=0, current=head, core-таблицы существуют.

Паттерн: как test_migration_bootstrap_resilience.py (реальный dev PG,
scratch-БД). Требует psycopg + alembic.
"""
import os
import subprocess
import sys
import tempfile
import unittest

import psycopg

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

ADMIN_URL = os.environ.get(
    "E2_TEST_DATABASE_URL", "postgresql://fpc:fpc@localhost:5432/processmap"
)
SCRATCH_DB = "processmap_test_fresh_boot"


def _pg_available() -> bool:
    try:
        with psycopg.connect(ADMIN_URL, connect_timeout=3, autocommit=True) as con:
            con.execute("SELECT 1")
        return True
    except Exception:
        return False


def _admin_url_for(dbname: str) -> str:
    base, _, _ = ADMIN_URL.rpartition("/")
    return f"{base}/{dbname}"


def _alembic_available() -> bool:
    try:
        import alembic  # noqa: F401
        return True
    except Exception:
        return False


@unittest.skipUnless(_pg_available(), "dev PG недоступен")
@unittest.skipUnless(_alembic_available(), "alembic не установлен в текущем venv")
class MigrationFreshDbBootstrapTests(unittest.TestCase):
    """Свежий postgres volume (пустая БД) → db_bootstrap → head без degraded."""

    @classmethod
    def setUpClass(cls):
        cls.db_url = _admin_url_for(SCRATCH_DB)
        with psycopg.connect(ADMIN_URL, autocommit=True) as con:
            con.execute(f"DROP DATABASE IF EXISTS {SCRATCH_DB}")
            con.execute(f"CREATE DATABASE {SCRATCH_DB}")
        # БД намеренно остаётся пустой: ни alembic_version, ни маркеров схемы.
        # head-ревизия из источника истины (как F3-тест в resilience-файле).
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from backend.scripts.db_bootstrap import LINEAR

        cls.head = LINEAR[-1]

    @classmethod
    def tearDownClass(cls):
        with psycopg.connect(ADMIN_URL, autocommit=True) as con:
            con.execute(f"DROP DATABASE IF EXISTS {SCRATCH_DB}")

    def setUp(self):
        self.backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        self.worktree_root = os.path.dirname(self.backend_dir)
        self.env = dict(os.environ, DATABASE_URL=self.db_url)
        # alembic читает sqlalchemy.url из ini (не из env) — патчим, как entrypoint.
        tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".ini", prefix="alembic.fresh.", delete=False
        )
        with open(os.path.join(self.backend_dir, "alembic.ini"), "r", encoding="utf-8") as src:
            content = src.read()
        ini_url = self.db_url.replace("postgresql://", "postgresql+psycopg://", 1)
        tmp.write(
            "\n".join(
                f"sqlalchemy.url = {ini_url}" if line.startswith("sqlalchemy.url") else line
                for line in content.splitlines()
            )
        )
        tmp.close()
        self.ini = tmp.name

    def _bootstrap(self) -> int:
        proc = subprocess.run(
            [sys.executable, "backend/scripts/db_bootstrap.py", self.ini],
            cwd=self.worktree_root,
            env=self.env,
            capture_output=True,
            text=True,
        )
        self._last_stdout = proc.stdout
        self._last_stderr = proc.stderr
        return proc.returncode

    def test_fresh_db_bootstrap_reaches_head(self):
        rc = self._bootstrap()
        self.assertEqual(
            rc,
            0,
            "db_bootstrap на пустой БД не дошёл до head:\n"
            f"STDOUT: {self._last_stdout[-2000:]}\nSTDERR: {self._last_stderr[-3000:]}",
        )
        with psycopg.connect(self.db_url) as con:
            row = con.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
            tables = {
                str(r[0])
                for r in con.execute(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
                ).fetchall()
            }
            user_cols = {
                str(r[0])
                for r in con.execute(
                    "SELECT column_name FROM information_schema.columns WHERE table_name='users'"
                ).fetchall()
            }
            session_cols = {
                str(r[0])
                for r in con.execute(
                    "SELECT column_name FROM information_schema.columns WHERE table_name='sessions'"
                ).fetchall()
            }
        self.assertEqual(str(row[0]), self.head)
        # Минимальный набор core-таблиц: runtime-DDL + alembic-донесённые колонки.
        for t in ("users", "sessions", "bpmn_versions", "feature_flags", "llm_providers", "llm_prompts"):
            self.assertIn(t, tables, f"таблица {t} отсутствует на fresh-БД")
        self.assertIn("role", user_cols)
        self.assertIn("process_layer", session_cols)
        self.assertIn("derived_from_session_id", session_cols)

    def test_fresh_db_bootstrap_is_idempotent(self):
        rc1 = self._bootstrap()
        self.assertEqual(rc1, 0, self._last_stderr[-2000:])
        rc2 = self._bootstrap()
        self.assertEqual(rc2, 0, "повторный прогон на уже поднятой fresh-БД failed")
        with psycopg.connect(self.db_url) as con:
            row = con.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
        self.assertEqual(str(row[0]), self.head)


if __name__ == "__main__":
    unittest.main()
