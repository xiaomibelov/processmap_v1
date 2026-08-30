import importlib
import json
import os
import shutil
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


class AdminGraphsTests(unittest.TestCase):
    def setUp(self):
        self.tmp_name = tempfile.mkdtemp()
        self.graphs_dir = Path(self.tmp_name) / "graphify-out"
        self.graphs_dir.mkdir(parents=True, exist_ok=True)
        self.old_graphs_dir = os.environ.get("GRAPHS_DIR")
        os.environ["GRAPHS_DIR"] = str(self.graphs_dir)

        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_backend = os.environ.get("FPC_BACKEND")
        self.old_db_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp_name) / "admin_graphs.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        import app.storage as storage
        importlib.reload(storage)
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

        from app.auth import create_user
        from app.storage import get_default_org_id, get_storage

        self.get_storage = get_storage
        self.org_id = get_default_org_id()

        self.admin_user = create_user("admin@local", "adminpass", is_admin=True)
        self.admin_id = str(self.admin_user.get("id") or "")

        self.viewer_user = create_user("viewer@local", "pass", is_admin=False)
        self.viewer_id = str(self.viewer_user.get("id") or "")
        self._insert_membership(self.org_id, self.viewer_id, "org_viewer")

        from app.routers.admin import (
            admin_graphs_snapshots,
            admin_graphs_current_snapshot,
            admin_graphs_current_html,
            admin_graphs_current_json,
            admin_graphs_rebuild,
            admin_graphs_rebuild_status,
            admin_graphs_analytics,
        )

        self.snapshots_fn = admin_graphs_snapshots
        self.current_fn = admin_graphs_current_snapshot
        self.html_fn = admin_graphs_current_html
        self.json_fn = admin_graphs_current_json
        self.rebuild_fn = admin_graphs_rebuild
        self.rebuild_status_fn = admin_graphs_rebuild_status
        self.analytics_fn = admin_graphs_analytics

    def tearDown(self):
        shutil.rmtree(self.tmp_name, ignore_errors=True)
        for key, val in [
            ("GRAPHS_DIR", self.old_graphs_dir),
            ("PROCESS_DB_PATH", self.old_db_path),
            ("PROCESS_STORAGE_DIR", self.old_storage_dir),
            ("FPC_DB_BACKEND", self.old_backend),
            ("DATABASE_URL", self.old_db_url),
        ]:
            if val is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = val

        import app.storage as storage
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

    def _insert_membership(self, org_id, user_id, role):
        from app.storage import _connect
        with _connect() as con:
            con.execute(
                "INSERT OR REPLACE INTO org_memberships (org_id, user_id, role) VALUES (?,?,?)",
                [org_id, user_id, role],
            )
            con.commit()

    def _admin_request(self):
        return _DummyRequest(
            {"id": self.admin_id, "email": "admin@local", "is_admin": True},
            active_org_id=self.org_id,
        )

    def _viewer_request(self):
        return _DummyRequest(
            {"id": self.viewer_id, "email": "viewer@local", "is_admin": False},
            active_org_id=self.org_id,
        )

    def _unauth_request(self):
        return _DummyRequest({}, active_org_id=self.org_id)

    def _create_snapshot(self, snapshot_id="20260830-000000-000000", is_current=True):
        snapshots_dir = self.graphs_dir / "snapshots"
        snapshot_dir = snapshots_dir / snapshot_id
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        meta = {
            "id": snapshot_id,
            "created_at": "2026-08-30T00:00:00+00:00",
            "commit_sha": "abc123",
            "commit_message": "test",
        }
        (snapshot_dir / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
        (snapshot_dir / "graph.html").write_text("<html>graph</html>", encoding="utf-8")
        (snapshot_dir / "graph.json").write_text(json.dumps({"nodes": [], "links": []}), encoding="utf-8")
        (snapshot_dir / "nodes.json").write_text(json.dumps([
            {"id": "n1", "layer": "backend", "layer_label": "Backend", "layer_color": "#000", "degree": 5, "member_count": 3, "category": "core"},
        ]), encoding="utf-8")
        (snapshot_dir / ".graphify_analysis.json").write_text(json.dumps({
            "raw_nodes": 10,
            "raw_edges": 20,
            "communities": {},
            "cross_community_edges": [],
        }), encoding="utf-8")
        if is_current:
            current_link = snapshots_dir / "current"
            if current_link.exists() or current_link.is_symlink():
                current_link.unlink()
            current_link.symlink_to(snapshot_dir, target_is_directory=True)
        return snapshot_dir

    # ── Auth tests ────────────────────────────────────────────────────────────

    def test_snapshots_admin_allowed(self):
        result = self.snapshots_fn(self._admin_request())
        self.assertTrue(isinstance(result, list))

    def test_snapshots_viewer_forbidden_403(self):
        result = self.snapshots_fn(self._viewer_request())
        self.assertEqual(result.status_code, 403)

    def test_snapshots_unauth_401(self):
        result = self.snapshots_fn(self._unauth_request())
        self.assertEqual(result.status_code, 401)

    # ── Snapshot tests ────────────────────────────────────────────────────────

    def test_current_snapshot_404_when_none(self):
        result = self.current_fn(self._admin_request())
        self.assertEqual(result.status_code, 404)

    def test_current_snapshot_returns_meta(self):
        self._create_snapshot()
        result = self.current_fn(self._admin_request())
        self.assertEqual(result.id, "20260830-000000-000000")
        self.assertTrue(result.is_current)

    def test_current_html_requires_snapshot(self):
        result = self.html_fn(self._admin_request())
        self.assertEqual(result.status_code, 404)

    def test_current_html_returns_html(self):
        self._create_snapshot()
        result = self.html_fn(self._admin_request())
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.body.decode(), "<html>graph</html>")

    def test_current_json_returns_json(self):
        self._create_snapshot()
        result = self.json_fn(self._admin_request())
        self.assertEqual(result.status_code, 200)
        data = json.loads(result.body)
        self.assertIn("nodes", data)

    # ── Rebuild tests ─────────────────────────────────────────────────────────

    def test_rebuild_starts_job(self):
        result = self.rebuild_fn(self._admin_request())
        self.assertTrue(hasattr(result, "job_id"))
        self.assertTrue(result.job_id)
        self.assertEqual(result.status, "pending")

    def test_rebuild_status_not_found(self):
        result = self.rebuild_status_fn("no-such-job", self._admin_request())
        self.assertEqual(result.status_code, 404)

    # ── Analytics tests ───────────────────────────────────────────────────────

    def test_analytics_requires_snapshot(self):
        result = self.analytics_fn(self._admin_request())
        self.assertEqual(result.status_code, 404)

    def test_analytics_returns_layer_distribution(self):
        self._create_snapshot()
        result = self.analytics_fn(self._admin_request())
        self.assertTrue(hasattr(result, "snapshot_id"))
        self.assertEqual(result.snapshot_id, "20260830-000000-000000")
        self.assertEqual(result.total_nodes, 10)
        self.assertTrue(len(result.layer_distribution) > 0)


if __name__ == "__main__":
    unittest.main()
