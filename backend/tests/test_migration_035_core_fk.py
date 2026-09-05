"""035 — FK-целостность core-таблиц: fail-fast на orphans, enforcement, cascade, downgrade.

Гейт миграции 035_core_fk_constraints.py (fix/db-fk-integrity):
- висячая ссылка → upgrade падает с перечнем отношений и счётчиками;
- чистая БД → upgrade создаёт 5 FK, DB отклоняет orphan-вставки;
- DELETE сессии каскадно чистит bpmn_versions/session_state_versions,
  audit_log выживает с session_id = NULL (SET NULL);
- downgrade снимает констрейнты;
- cleanup_orphans.sql: dry-run не пишет, apply чистит, повторный прогон — 0.

Паттерн: реальный dev PG (как test_migration_bootstrap_resilience.py), scratch-БД
processmap_test_fk035 (CREATE/DROP отдельной базы; рабочая processmap не трогается).
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

import psycopg

ADMIN_URL = os.environ.get(
    "E2_TEST_DATABASE_URL", "postgresql://fpc:fpc@localhost:5432/processmap"
)
SCRATCH_DB = "processmap_test_fk035"

CORE_TABLES = [
    "users",
    "orgs",
    "sessions",
    "bpmn_versions",
    "session_state_versions",
    "audit_log",
    "org_memberships",
    "workspaces",
]

FKS = [
    ("bpmn_versions", "session_id"),
    ("session_state_versions", "session_id"),
    ("audit_log", "session_id"),
    ("org_memberships", "user_id"),
    ("workspaces", "org_id"),
]
FK_NAMES = {f"{t}_{c}_fkey" for t, c in FKS}

# Минимальные определения core-таблиц (NOT NULL сохранён там, где он есть
# в runtime-DDL — см. app/domains/storage/compat/repository.py _ensure_schema).
SCHEMA_DDL = """
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE
);
CREATE TABLE orgs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT ''
);
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    org_id TEXT NOT NULL DEFAULT 'org_default'
);
CREATE TABLE bpmn_versions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    version_number INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE session_state_versions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    diagram_state_version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL DEFAULT '',
    entity_type TEXT NOT NULL DEFAULT '',
    entity_id TEXT NOT NULL DEFAULT '',
    session_id TEXT
);
CREATE TABLE org_memberships (
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'editor',
    PRIMARY KEY (org_id, user_id)
);
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT ''
);
"""


def _pg_available() -> bool:
    try:
        with psycopg.connect(ADMIN_URL, connect_timeout=3, autocommit=True) as con:
            con.execute("SELECT 1")
        return True
    except Exception:
        return False


def _alembic_available() -> bool:
    try:
        import alembic  # noqa: F401

        return True
    except Exception:
        return False


def _admin_url_for(dbname: str) -> str:
    base, _, _ = ADMIN_URL.rpartition("/")
    return f"{base}/{dbname}"


@unittest.skipUnless(_pg_available(), "dev PG недоступен")
@unittest.skipUnless(_alembic_available(), "alembic не установлен в текущем venv")
class Migration035CoreFkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_url = _admin_url_for(SCRATCH_DB)
        with psycopg.connect(ADMIN_URL, autocommit=True) as con:
            con.execute(f"DROP DATABASE IF EXISTS {SCRATCH_DB}")
            con.execute(f"CREATE DATABASE {SCRATCH_DB}")
        with psycopg.connect(cls.db_url, autocommit=True) as con:
            con.execute(SCHEMA_DDL)
            con.execute(
                "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"
            )

        cls.backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".ini", prefix="alembic.fk035.", delete=False
        )
        with open(os.path.join(cls.backend_dir, "alembic.ini"), "r", encoding="utf-8") as src:
            content = src.read()
        ini_url = cls.db_url.replace("postgresql://", "postgresql+psycopg://", 1)
        content = "\n".join(
            f"sqlalchemy.url = {ini_url}" if line.startswith("sqlalchemy.url") else line
            for line in content.splitlines()
        )
        tmp.write(content)
        tmp.close()
        cls.ini = tmp.name
        cls.env = dict(os.environ, DATABASE_URL=cls.db_url)
        cls.cleanup_sql = os.path.join(cls.backend_dir, "scripts", "cleanup_orphans.sql")

    @classmethod
    def tearDownClass(cls):
        os.unlink(cls.ini)
        with psycopg.connect(ADMIN_URL, autocommit=True) as con:
            con.execute(f"DROP DATABASE IF EXISTS {SCRATCH_DB}")

    def setUp(self):
        """Каждый тест с чистого листа: без FK, без строк, stamped 034."""
        with psycopg.connect(self.db_url, autocommit=True) as con:
            for table, col in FKS:
                con.execute(
                    f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {table}_{col}_fkey"
                )
            tables = ", ".join(CORE_TABLES)
            con.execute(f"TRUNCATE {tables} CASCADE")
            con.execute("DELETE FROM alembic_version")
            con.execute("INSERT INTO alembic_version (version_num) VALUES ('034')")

    # ── helpers ──────────────────────────────────────────────────────────

    def _alembic(self, *args):
        proc = subprocess.run(
            [sys.executable, "-m", "alembic", "-c", self.ini, *args],
            cwd=self.backend_dir,
            env=self.env,
            capture_output=True,
            text=True,
        )
        return proc.returncode, proc.stdout + proc.stderr

    def _existing_fk_names(self):
        with psycopg.connect(self.db_url) as con:
            rows = con.execute(
                "SELECT conname FROM pg_constraint WHERE contype = 'f'"
            ).fetchall()
        return {str(r[0]) for r in rows}

    def _seed_parents(self, con):
        con.execute("INSERT INTO orgs (id, name) VALUES ('org_1', 'Org')")
        con.execute("INSERT INTO users (id, email) VALUES ('user_1', 'u1@local')")
        con.execute("INSERT INTO sessions (id, title) VALUES ('sess_1', 'S')")

    def _run_cleanup(self, dry_run: bool):
        r"""cleanup_orphans.sql с подставленным флагом (psql \set override'ит -v,
        поэтому флаг подменяется в временной копии файла)."""
        with open(self.cleanup_sql, "r", encoding="utf-8") as f:
            body = f.read()
        # Якорь на начало строки: в шапке скрипта есть пример sed с похожим текстом.
        body = re.sub(
            r"(?m)^\\set dry_run true$",
            f"\\\\set dry_run {'true' if dry_run else 'false'}",
            body,
            count=1,
        )
        tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".sql", prefix="cleanup_orphans.", delete=False
        )
        tmp.write(body)
        tmp.close()
        try:
            proc = subprocess.run(
                ["psql", self.db_url, "-v", "ON_ERROR_STOP=1", "-q", "-f", tmp.name],
                capture_output=True,
                text=True,
            )
        finally:
            os.unlink(tmp.name)
        return proc.returncode, proc.stdout + proc.stderr

    # ── tests ────────────────────────────────────────────────────────────

    def test_orphan_blocks_upgrade_with_counts(self):
        """Висячая org_memberships → upgrade падает, сообщение называет
        отношение, счётчик и cleanup_orphans.sql. После чистки — проходит."""
        with psycopg.connect(self.db_url, autocommit=True) as con:
            con.execute(
                "INSERT INTO org_memberships (org_id, user_id) VALUES ('org_x', 'user_missing')"
            )
        rc, out = self._alembic("upgrade", "head")
        self.assertNotEqual(rc, 0, "upgrade должен упасть на orphan-строках")
        self.assertIn("org_memberships.user_id", out)
        self.assertIn("users.id: 1", out)
        self.assertIn("cleanup_orphans.sql", out)

        # чистка → повторный upgrade проходит (FK созданы)
        with psycopg.connect(self.db_url, autocommit=True) as con:
            con.execute("DELETE FROM org_memberships")
        rc, out = self._alembic("upgrade", "head")
        self.assertEqual(rc, 0, f"upgrade после чистки failed:\n{out}")
        self.assertEqual(self._existing_fk_names(), FK_NAMES)

    def test_clean_upgrade_creates_fks_and_enforces_them(self):
        """Чистая БД: upgrade создаёт ровно 5 FK; DB отклоняет orphan-вставки."""
        rc, out = self._alembic("upgrade", "head")
        self.assertEqual(rc, 0, f"upgrade failed:\n{out}")
        self.assertEqual(self._existing_fk_names(), FK_NAMES)

        with psycopg.connect(self.db_url, autocommit=True) as con:
            self._seed_parents(con)
            # валидные строки проходят
            con.execute(
                "INSERT INTO bpmn_versions (id, session_id) VALUES ('bv_1', 'sess_1')"
            )
            con.execute(
                "INSERT INTO session_state_versions (id, session_id) VALUES ('sv_1', 'sess_1')"
            )
            con.execute(
                "INSERT INTO org_memberships (org_id, user_id) VALUES ('org_1', 'user_1')"
            )
            con.execute(
                "INSERT INTO workspaces (id, org_id) VALUES ('ws_1', 'org_1')"
            )
            con.execute(
                "INSERT INTO audit_log (id, org_id, session_id) VALUES ('al_1', 'org_1', 'sess_1')"
            )
            # висячие ссылки отклоняются
            with self.assertRaises(psycopg.errors.ForeignKeyViolation):
                con.execute(
                    "INSERT INTO bpmn_versions (id, session_id) VALUES ('bv_bad', 'sess_missing')"
                )
            with self.assertRaises(psycopg.errors.ForeignKeyViolation):
                con.execute(
                    "INSERT INTO session_state_versions (id, session_id) VALUES ('sv_bad', 'sess_missing')"
                )
            with self.assertRaises(psycopg.errors.ForeignKeyViolation):
                con.execute(
                    "INSERT INTO audit_log (id, org_id, session_id) VALUES ('al_bad', 'org_1', 'sess_missing')"
                )
            with self.assertRaises(psycopg.errors.ForeignKeyViolation):
                con.execute(
                    "INSERT INTO org_memberships (org_id, user_id) VALUES ('org_1', 'user_missing')"
                )
            with self.assertRaises(psycopg.errors.ForeignKeyViolation):
                con.execute(
                    "INSERT INTO workspaces (id, org_id) VALUES ('ws_bad', 'org_missing')"
                )

    def test_cascade_delete_session(self):
        """DELETE сессии: каскадно исчезают bpmn_versions/session_state_versions,
        audit_log выживает с session_id = NULL."""
        rc, out = self._alembic("upgrade", "head")
        self.assertEqual(rc, 0, f"upgrade failed:\n{out}")
        with psycopg.connect(self.db_url, autocommit=True) as con:
            self._seed_parents(con)
            con.execute("INSERT INTO bpmn_versions (id, session_id) VALUES ('bv_1', 'sess_1')")
            con.execute(
                "INSERT INTO session_state_versions (id, session_id) VALUES ('sv_1', 'sess_1')"
            )
            con.execute(
                "INSERT INTO audit_log (id, org_id, session_id) VALUES ('al_1', 'org_1', 'sess_1')"
            )
            con.execute(
                "INSERT INTO audit_log (id, org_id, session_id) VALUES ('al_2', 'org_1', NULL)"
            )
            con.execute("DELETE FROM sessions WHERE id = 'sess_1'")

            self.assertEqual(con.execute("SELECT COUNT(*) FROM bpmn_versions").fetchone()[0], 0)
            self.assertEqual(
                con.execute("SELECT COUNT(*) FROM session_state_versions").fetchone()[0], 0
            )
            # audit trail сохранился, ссылка обнулена
            self.assertEqual(con.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0], 2)
            self.assertEqual(
                con.execute(
                    "SELECT session_id FROM audit_log WHERE id = 'al_1'"
                ).fetchone()[0],
                None,
            )

    def test_downgrade_drops_constraints(self):
        """downgrade снимает 5 FK (pg_constraint пуст по ним)."""
        rc, out = self._alembic("upgrade", "head")
        self.assertEqual(rc, 0, f"upgrade failed:\n{out}")
        self.assertEqual(self._existing_fk_names(), FK_NAMES)

        rc, out = self._alembic("downgrade", "034")
        self.assertEqual(rc, 0, f"downgrade failed:\n{out}")
        self.assertEqual(self._existing_fk_names(), set())

        # downgrade идемпотентен в терминах повторного upgrade
        rc, out = self._alembic("upgrade", "head")
        self.assertEqual(rc, 0, f"повторный upgrade failed:\n{out}")
        self.assertEqual(self._existing_fk_names(), FK_NAMES)

    @unittest.skipUnless(shutil.which("psql"), "psql недоступен")
    def test_cleanup_script_dry_run_apply_idempotent(self):
        """cleanup_orphans.sql: dry-run не пишет; apply чистит 4 таблицы и
        обнуляет audit_log; повторный прогон сообщает 0."""
        with psycopg.connect(self.db_url, autocommit=True) as con:
            self._seed_parents(con)
            # 5 висячих ссылок + 1 валидная audit-запись
            con.execute("INSERT INTO bpmn_versions (id, session_id) VALUES ('bv_bad', 'sess_missing')")
            con.execute(
                "INSERT INTO session_state_versions (id, session_id) VALUES ('sv_bad', 'sess_missing')"
            )
            con.execute(
                "INSERT INTO audit_log (id, org_id, session_id) VALUES ('al_bad', 'org_1', 'sess_missing')"
            )
            con.execute(
                "INSERT INTO audit_log (id, org_id, session_id) VALUES ('al_ok', 'org_1', 'sess_1')"
            )
            con.execute(
                "INSERT INTO org_memberships (org_id, user_id) VALUES ('org_x', 'user_missing')"
            )
            con.execute("INSERT INTO workspaces (id, org_id) VALUES ('ws_bad', 'org_missing')")

        # dry-run: считает, но не пишет
        rc, out = self._run_cleanup(dry_run=True)
        self.assertEqual(rc, 0, f"cleanup dry-run failed:\n{out}")
        self.assertIn("bpmn_versions_orphans", out)
        with psycopg.connect(self.db_url) as con:
            self.assertEqual(
                con.execute("SELECT COUNT(*) FROM bpmn_versions").fetchone()[0], 1
            )
            self.assertEqual(
                con.execute(
                    "SELECT session_id FROM audit_log WHERE id = 'al_bad'"
                ).fetchone()[0],
                "sess_missing",
            )

        # apply: orphans удалены/обнулены, валидные строки целы
        rc, out = self._run_cleanup(dry_run=False)
        self.assertEqual(rc, 0, f"cleanup apply failed:\n{out}")
        with psycopg.connect(self.db_url) as con:
            self.assertEqual(con.execute("SELECT COUNT(*) FROM bpmn_versions").fetchone()[0], 0)
            self.assertEqual(
                con.execute("SELECT COUNT(*) FROM session_state_versions").fetchone()[0], 0
            )
            self.assertEqual(
                con.execute("SELECT COUNT(*) FROM org_memberships").fetchone()[0], 0
            )
            self.assertEqual(con.execute("SELECT COUNT(*) FROM workspaces").fetchone()[0], 0)
            # audit trail выжил, ссылка обнулена; валидная запись не тронута
            self.assertEqual(con.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0], 2)
            self.assertEqual(
                con.execute("SELECT session_id FROM audit_log WHERE id = 'al_bad'").fetchone()[0],
                None,
            )
            self.assertEqual(
                con.execute("SELECT session_id FROM audit_log WHERE id = 'al_ok'").fetchone()[0],
                "sess_1",
            )

        # идемпотентность: второй прогон — висячих ссылок не осталось
        rc, out = self._run_cleanup(dry_run=False)
        self.assertEqual(rc, 0, f"cleanup повторный прогон failed:\n{out}")
        with psycopg.connect(self.db_url) as con:
            self.assertEqual(con.execute("SELECT COUNT(*) FROM bpmn_versions bv WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = bv.session_id)").fetchone()[0], 0)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM session_state_versions sv WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = sv.session_id)").fetchone()[0], 0)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM org_memberships m WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id)").fetchone()[0], 0)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM workspaces w WHERE NOT EXISTS (SELECT 1 FROM orgs o WHERE o.id = w.org_id)").fetchone()[0], 0)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM audit_log a WHERE a.session_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = a.session_id)").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
