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


class AdminSessionAnalyticsSummaryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "admin_session_analytics.sqlite3")
        self.old_env = {
            key: os.environ.get(key)
            for key in (
                "PROCESS_DB_PATH",
                "PROCESS_STORAGE_DIR",
                "PROJECT_STORAGE_DIR",
                "DATABASE_URL",
                "FPC_DB_BACKEND",
            )
        }
        os.environ["PROCESS_DB_PATH"] = self.db_path
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)

        from app.db.config import get_db_runtime_config
        import app.storage as storage

        get_db_runtime_config.cache_clear()
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""

        from app.auth import create_user
        from app.routers.admin import admin_analytics_sessions_summary
        from app.session_analytics import clear_analytics_cache
        from app.storage import _connect, _ensure_schema, get_default_org_id, list_user_org_memberships

        self.endpoint = admin_analytics_sessions_summary
        self._connect = _connect
        self._ensure_schema = _ensure_schema
        self.default_org_id = get_default_org_id()
        self.admin = create_user("analytics.admin@local", "strongpass1", is_admin=True)
        self.user_a = create_user("author.a@local", "strongpass1", is_admin=False)
        self.user_b = create_user("author.b@local", "strongpass1", is_admin=False)
        self.viewer = create_user("analytics.viewer@local", "strongpass1", is_admin=False)
        list_user_org_memberships(str(self.viewer.get("id") or ""), is_admin=False)
        self.request = _DummyRequest(self.admin, active_org_id=self.default_org_id)
        self.viewer_request = _DummyRequest(self.viewer, active_org_id=self.default_org_id)
        clear_analytics_cache()
        self._seed()

    def tearDown(self):
        for key, value in self.old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.tmp.cleanup()

    def _insert_session(self, *, sid, created_at, updated_at, bpmn_xml="<x/>", created_by=""):
        with self._connect() as con:
            con.execute(
                """
                INSERT INTO sessions (id, title, org_id, created_by, updated_by, created_at, updated_at, bpmn_xml)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [sid, f"Session {sid}", self.default_org_id, created_by, created_by, created_at, updated_at, bpmn_xml],
            )
            con.commit()

    def _insert_versions(self, *, sid, count, base_ts=1000):
        with self._connect() as con:
            for idx in range(count):
                con.execute(
                    """
                    INSERT INTO bpmn_versions (id, session_id, org_id, version_number, created_at, created_by)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    [f"ver_{sid}_{idx}", sid, self.default_org_id, idx + 1, base_ts + idx, ""],
                )
            con.commit()

    def _seed(self):
        user_a = str(self.user_a.get("id") or "")
        # s1: zero duration (abandoned bin), 0 versions
        self._insert_session(sid="s1", created_at=1000, updated_at=1000, created_by=user_a)
        # s2: 30 minutes, 1 version
        self._insert_session(sid="s2", created_at=1000, updated_at=2800, created_by=user_a)
        self._insert_versions(sid="s2", count=1)
        # s3: ~13.9 hours, empty xml, 3 versions
        self._insert_session(sid="s3", created_at=1000, updated_at=51000, bpmn_xml="", created_by=user_a)
        self._insert_versions(sid="s3", count=3)
        # s4: ~2.3 days, 7 versions
        self._insert_session(sid="s4", created_at=1000, updated_at=201000, created_by=user_a)
        self._insert_versions(sid="s4", count=7)
        # s5: ~8.1 days (active, real_work), 20 versions
        self._insert_session(sid="s5", created_at=1000, updated_at=701000, created_by=user_a)
        self._insert_versions(sid="s5", count=20)
        # s6: ~34.7 days (active, real_work), 60 versions
        self._insert_session(sid="s6", created_at=1000, updated_at=3001000, created_by=user_a)
        self._insert_versions(sid="s6", count=60)
        # s7: created > updated (data quality), orphan created_by, 0 versions
        self._insert_session(sid="s7", created_at=5000, updated_at=1000, created_by="ghost_user")

    def test_summary_exact_aggregates(self):
        out = self.endpoint(self.request, refresh="")
        self.assertTrue(bool(out.get("ok")))
        summary = out.get("summary") or {}
        self.assertEqual(summary.get("total_sessions"), 7)
        self.assertEqual(summary.get("total_versions"), 91)
        self.assertEqual(summary.get("total_users"), 4)
        self.assertEqual(summary.get("active_sessions"), 2)
        self.assertEqual(summary.get("active_sessions_pct"), 28.6)
        self.assertEqual(summary.get("abandoned_sessions"), 1)
        self.assertEqual(summary.get("abandoned_sessions_pct"), 14.3)
        self.assertEqual(summary.get("avg_versions_per_session"), 18.2)
        self.assertEqual(summary.get("sessions_with_history"), 5)
        self.assertEqual(summary.get("sessions_with_history_pct"), 71.4)

    def test_lifetime_distribution_bins(self):
        out = self.endpoint(self.request, refresh="true")
        dist = out.get("lifetime_distribution") or []
        self.assertEqual([row.get("bin") for row in dist], ["0мин", "1-60мин", "1-24ч", "1-7д", "7-30д", "30+д"])
        self.assertEqual([row.get("count") for row in dist], [1, 1, 1, 1, 1, 1])
        self.assertEqual([row.get("percentage") for row in dist], [14.3, 14.3, 14.3, 14.3, 14.3, 14.3])
        self.assertEqual(dist[0].get("color_label"), "abandoned")
        self.assertEqual(dist[4].get("color_label"), "real_work")
        self.assertEqual(dist[5].get("color_label"), "real_work")
        self.assertEqual(dist[1].get("color_label"), "neutral")

    def test_version_distribution_bins(self):
        out = self.endpoint(self.request, refresh="true")
        dist = out.get("version_distribution") or []
        self.assertEqual([row.get("bin") for row in dist], ["1", "2-5", "6-10", "10-50", "50+"])
        self.assertEqual([row.get("count") for row in dist], [1, 1, 1, 1, 1])
        self.assertEqual([row.get("percentage") for row in dist], [20.0, 20.0, 20.0, 20.0, 20.0])

    def test_data_quality(self):
        out = self.endpoint(self.request, refresh="true")
        quality = out.get("data_quality") or {}
        self.assertEqual(quality.get("empty_xml"), 1)
        self.assertEqual(quality.get("orphan_created_by"), 1)
        self.assertEqual(quality.get("created_gt_updated"), 1)
        self.assertEqual(quality.get("no_versions"), 2)
        self.assertEqual(quality.get("no_versions_pct"), 28.6)

    def test_cache_hit_returns_same_payload_and_refresh_bypasses(self):
        first = self.endpoint(self.request, refresh="")
        # New data after the first call must not appear until refresh/expiry.
        self._insert_session(sid="s8", created_at=1000, updated_at=1000)
        second = self.endpoint(self.request, refresh="")
        self.assertEqual(second.get("generated_at"), first.get("generated_at"))
        self.assertEqual((second.get("summary") or {}).get("total_sessions"), 7)
        third = self.endpoint(self.request, refresh="true")
        self.assertEqual((third.get("summary") or {}).get("total_sessions"), 8)

    def test_auth_admin_restriction_works(self):
        out = self.endpoint(self.viewer_request, refresh="")
        self.assertEqual(getattr(out, "status_code", 0), 403)


if __name__ == "__main__":
    unittest.main()
