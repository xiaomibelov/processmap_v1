"""F1/F2 — гейт устойчивости миграций (инцидент 04.08, degraded-старт stage).

Гейт владельца: «010 дважды на одной БД → второй прогон no-op».
Заодно: baseline-маркеры 010/011/012 (F2) — stamped-down/невалидная
alembic_version лечится db_bootstrap без ручного вмешательства.

Паттерн: реальный dev PG (как test_api_contracts.py), scratch-БД на тест.
Требует psycopg + alembic (requirements backend).
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
SCRATCH_DB = "processmap_test_mig010"


def _pg_available() -> bool:
    try:
        with psycopg.connect(ADMIN_URL, connect_timeout=3, autocommit=True) as con:
            con.execute("SELECT 1")
        return True
    except Exception:
        return False


def _admin_url_for(dbname: str) -> str:
    # postgresql://user:pass@host:port/db → та же БД-кластер, другая база
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
class MigrationBootstrapResilienceTests(unittest.TestCase):
    """Scratch-БД имитирует stamped-down состояние stage (минимальная
    legacy-схема sessions/bpmn_versions, как после рантайм-патчей)."""

    @classmethod
    def setUpClass(cls):
        cls.db_url = _admin_url_for(SCRATCH_DB)
        with psycopg.connect(ADMIN_URL, autocommit=True) as con:
            con.execute(f"DROP DATABASE IF EXISTS {SCRATCH_DB}")
            con.execute(f"CREATE DATABASE {SCRATCH_DB}")
        with psycopg.connect(cls.db_url, autocommit=True) as con:
            # минимальный каркас, достаточный для 010/011 (012 таблицы создаёт сама)
            con.execute(
                """
                CREATE TABLE sessions (
                    id TEXT PRIMARY KEY,
                    org_id TEXT,
                    project_id TEXT,
                    title TEXT,
                    mode TEXT,
                    parent_session_id TEXT,
                    derived_from_session_id TEXT
                )
                """
            )
            con.execute(
                """
                CREATE TABLE bpmn_versions (
                    session_id TEXT,
                    org_id TEXT,
                    version_number INTEGER
                )
                """
            )
            # stub-объекты маркеров 001–009 (db_bootstrap._compute_baseline
            # требует непрерывную цепочку маркеров снизу вверх)
            con.execute("CREATE TABLE users (id TEXT, role TEXT)")  # 001
            con.execute("CREATE TABLE process_template (id TEXT)")  # 002
            con.execute("CREATE TABLE transformation_rule (id TEXT)")  # 004
            con.execute("CREATE TABLE recipe_param_def (id TEXT, name TEXT)")  # 003
            con.execute("CREATE TABLE kitchen (id TEXT)")  # 005
            con.execute("CREATE TABLE process_template_version (id TEXT)")  # 006
            con.execute("CREATE TABLE sku_binding (id TEXT, pilot_kitchen_id TEXT)")  # 007
            con.execute("INSERT INTO recipe_param_def (id, name) VALUES ('stub', 'dish_sku_id')")  # 008
            con.execute("CREATE TABLE operation_catalog (id TEXT, code TEXT, name_ru TEXT)")  # 009

    @classmethod
    def tearDownClass(cls):
        with psycopg.connect(ADMIN_URL, autocommit=True) as con:
            con.execute(f"DROP DATABASE IF EXISTS {SCRATCH_DB}")

    def setUp(self):
        self.backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        self.worktree_root = os.path.dirname(self.backend_dir)
        tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".ini", prefix="alembic.gate.", delete=False
        )
        with open(os.path.join(self.backend_dir, "alembic.ini"), "r", encoding="utf-8") as src:
            content = src.read()
        ini_url = self.db_url.replace("postgresql://", "postgresql+psycopg://", 1)
        content = "\n".join(
            f"sqlalchemy.url = {ini_url}" if line.startswith("sqlalchemy.url") else line
            for line in content.splitlines()
        )
        tmp.write(content)
        tmp.close()
        self.ini = tmp.name
        self.env = dict(os.environ, DATABASE_URL=self.db_url)
        self._force_version("009")

    def _force_version(self, rev: str):
        """Прямая запись alembic_version (в отличие от `alembic stamp` не
        требует резолва текущей ревизии — устойчиво к bogus-значениям)."""
        with psycopg.connect(self.db_url, autocommit=True) as con:
            con.execute("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL)")
            con.execute("DELETE FROM alembic_version")
            con.execute("INSERT INTO alembic_version (version_num) VALUES (%s)", (rev,))

    def _alembic(self, *args):
        proc = subprocess.run(
            [sys.executable, "-m", "alembic", "-c", self.ini, *args],
            cwd=self.backend_dir,
            env=self.env,
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            print("ALEMBIC FAIL rc=", proc.returncode)
            print("STDOUT:", proc.stdout[-2000:])
            print("STDERR:", proc.stderr[-3000:])
        return proc.returncode

    def _stamp(self, rev):
        rc = self._alembic("stamp", rev)
        self.assertEqual(rc, 0, f"stamp {rev} failed")

    def _current(self) -> str:
        with psycopg.connect(self.db_url) as con:
            row = con.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
        return str(row[0]) if row else ""

    def _bootstrap(self) -> int:
        return subprocess.call(
            [sys.executable, "backend/scripts/db_bootstrap.py", self.ini],
            cwd=self.worktree_root,
            env=self.env,
        )

    def test_gate_010_twice_second_run_is_noop(self):
        """Гейт: db_bootstrap дважды на одной БД (stamped 009, как stage
        после бага #646) → оба прогона rc=0, второй — no-op, head=014 (LLM2)."""
        rc1 = self._bootstrap()
        self.assertEqual(rc1, 0, "первый прогон db_bootstrap failed (010 неидемпотентна?)")
        self.assertEqual(self._current(), "014")

        self._force_version("009")  # stamped-down состояние снова (повторный деплой)
        rc2 = self._bootstrap()
        self.assertEqual(rc2, 0, "второй прогон db_bootstrap failed — 010 не no-op")
        self.assertEqual(self._current(), "014")

        with psycopg.connect(self.db_url) as con:
            cols = {
                str(r[0])
                for r in con.execute(
                    "SELECT column_name FROM information_schema.columns WHERE table_name='sessions'"
                ).fetchall()
            }
            tables = {
                str(r[0])
                for r in con.execute(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
                ).fetchall()
            }
        self.assertIn("process_layer", cols)
        self.assertIn("derived_from_session_id", cols)
        self.assertIn("llm_providers", tables)

    def test_f2_markers_detect_schema_state_with_invalid_version(self):
        """F2: невалидная alembic_version → baseline по маркерам (010 уже в
        схеме после первого прогона) → stamp ≥010, upgrade добирает остальное."""
        rc1 = self._bootstrap()
        self.assertEqual(rc1, 0)
        # версия вне LINEAR (как у жертвы бага #646 до фикса)
        with psycopg.connect(self.db_url, autocommit=True) as con:
            con.execute("UPDATE alembic_version SET version_num='bogus_legacy_hash'")
        rc2 = self._bootstrap()
        self.assertEqual(rc2, 0, "db_bootstrap не вылечил невалидную версию по маркерам")
        self.assertEqual(self._current(), "014")

    def test_f3_head_constant_matches_db_bootstrap(self):
        """F3: ALEMBIC_HEAD в migration_state синхронен с db_bootstrap.LINEAR."""
        sys.path.insert(0, self.worktree_root)
        from backend.app.migration_state import ALEMBIC_HEAD
        from backend.scripts.db_bootstrap import LINEAR
        self.assertEqual(ALEMBIC_HEAD, LINEAR[-1])


class MigrationStateUnitTests(unittest.TestCase):
    """F3: семантика get_migration_state без PG (ok=None не деградирует)."""

    def test_no_database_url_is_unknown_not_degraded(self):
        sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
        from backend.app.migration_state import get_migration_state
        old = os.environ.pop("DATABASE_URL", None)
        try:
            state = get_migration_state(force=True)
        finally:
            if old is not None:
                os.environ["DATABASE_URL"] = old
        self.assertIsNone(state.get("ok"))
        self.assertEqual(state.get("error"), "no_database_url")
        self.assertEqual(state.get("head"), "014")


if __name__ == "__main__":
    unittest.main()
