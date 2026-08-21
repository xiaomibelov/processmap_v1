import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class AdminAgentRunsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_db_url = os.environ.get("DATABASE_URL")
        self.old_repo_root = os.environ.get("PROCESSMAP_REPO_ROOT")
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

        from app.auth import create_user
        from app.storage import get_default_org_id

        self.org_id = get_default_org_id()
        self.admin_user = create_user("admin@local", "adminpass", is_admin=True)
        self.admin_id = str(self.admin_user.get("id") or "")

        self.run_state_dir = Path(self.tmp.name) / ".agents" / "run-state"
        self.run_state_dir.mkdir(parents=True, exist_ok=True)
        os.environ["PROCESSMAP_REPO_ROOT"] = self.tmp.name

        from app.routers.admin import admin_agent_runs
        self.admin_agent_runs = admin_agent_runs
        self.request = _DummyRequest(self.admin_user, active_org_id=self.org_id)

    def tearDown(self):
        if getattr(self, "old_db_path", None) is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        if getattr(self, "old_storage_dir", None) is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if getattr(self, "old_backend", None) is None:
            os.environ.pop("FPC_DB_BACKEND", None)
        else:
            os.environ["FPC_DB_BACKEND"] = self.old_backend
        if getattr(self, "old_db_url", None) is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self.old_db_url
        if getattr(self, "old_repo_root", None) is None:
            os.environ.pop("PROCESSMAP_REPO_ROOT", None)
        else:
            os.environ["PROCESSMAP_REPO_ROOT"] = self.old_repo_root
        self.tmp.cleanup()

    def _make_run(self, run_id: str, contour_id: str = "", stop_requested: bool = False, agents=None):
        run_path = self.run_state_dir / run_id
        run_path.mkdir(parents=True, exist_ok=True)
        (run_path / "CID").write_text(contour_id, encoding="utf-8")
        if stop_requested:
            (run_path / "STOP_REQUESTED").touch()
        scripts_dir = run_path / "scripts"
        scripts_dir.mkdir(parents=True, exist_ok=True)
        if agents:
            for agent in agents:
                (scripts_dir / f"agent-{agent['agent']}-{agent['pid']}.sh").touch()
                if agent.get("highlight"):
                    (run_path / f"highlight-agent-{agent['agent']}.token").touch()
                if agent.get("log_mtime"):
                    log_path = run_path / f"kimi-agent-{agent['agent']}-{agent['log_mtime']}.log"
                    log_path.touch()
                    os.utime(log_path, (agent["log_mtime"], agent["log_mtime"]))

    def test_empty_run_state(self):
        result = self.admin_agent_runs(self.request)
        self.assertTrue(result.get("ok"))
        self.assertEqual(result.get("runs"), [])
        self.assertEqual(result.get("count"), 0)
        self.assertIn("generated_at", result)

    def test_active_run(self):
        import time
        now = int(time.time())
        self._make_run(
            "20260522T160309Z-89364",
            contour_id="feat/active-runs-monitor-v1",
            agents=[{"agent": "1", "pid": "904", "highlight": True, "log_mtime": now}],
        )
        result = self.admin_agent_runs(self.request)
        self.assertTrue(result.get("ok"))
        self.assertEqual(result.get("count"), 1)
        runs = result.get("runs")
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0]["run_id"], "20260522T160309Z-89364")
        self.assertEqual(runs[0]["contour_id"], "feat/active-runs-monitor-v1")
        self.assertEqual(runs[0]["status"], "active")
        self.assertFalse(runs[0]["stop_requested"])
        self.assertEqual(len(runs[0]["agents"]), 1)
        self.assertEqual(runs[0]["agents"][0]["agent"], "1")
        self.assertEqual(runs[0]["agents"][0]["pid"], "904")
        self.assertTrue(runs[0]["agents"][0]["highlight"])

    def test_stopping_run(self):
        import time
        now = int(time.time())
        self._make_run(
            "20260522T160310Z-12345",
            contour_id="feat/other",
            stop_requested=True,
            agents=[{"agent": "2", "pid": "1987", "highlight": False, "log_mtime": now}],
        )
        result = self.admin_agent_runs(self.request)
        self.assertTrue(result.get("ok"))
        runs = result.get("runs")
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0]["status"], "stopping")
        self.assertTrue(runs[0]["stop_requested"])

    def test_completed_run(self):
        import time
        old = int(time.time()) - 600
        self._make_run(
            "20260522T160311Z-99999",
            contour_id="feat/old",
            agents=[{"agent": "1", "pid": "111", "highlight": False, "log_mtime": old}],
        )
        result = self.admin_agent_runs(self.request)
        self.assertTrue(result.get("ok"))
        runs = result.get("runs")
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0]["status"], "completed")


if __name__ == "__main__":
    unittest.main()
