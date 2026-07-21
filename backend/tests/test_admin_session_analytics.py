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


class _AnalyticsTestBase(unittest.TestCase):
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
        from app.session_analytics import clear_analytics_cache
        from app.storage import _connect, _ensure_schema, get_default_org_id, list_user_org_memberships

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

    def _seed(self):
        raise NotImplementedError

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

    def _insert_versions(self, *, sid, count, base_ts=1000, created_by=""):
        with self._connect() as con:
            for idx in range(count):
                con.execute(
                    """
                    INSERT INTO bpmn_versions (id, session_id, org_id, version_number, created_at, created_by)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    [f"ver_{sid}_{idx}", sid, self.default_org_id, idx + 1, base_ts + idx, created_by],
                )
            con.commit()


class AdminSessionAnalyticsSummaryTest(_AnalyticsTestBase):
    def setUp(self):
        super().setUp()
        from app.routers.admin import admin_analytics_sessions_summary

        self.endpoint = admin_analytics_sessions_summary

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


class AdminSessionAnalyticsTopTest(_AnalyticsTestBase):
    def setUp(self):
        super().setUp()
        from app.routers.admin import admin_analytics_sessions_top

        self.endpoint = admin_analytics_sessions_top

    def _seed(self):
        import time

        user_a = str(self.user_a.get("id") or "")
        user_b = str(self.user_b.get("id") or "")
        now = int(time.time())
        # ta: 8 days lifetime (real_work), 5 versions, author A, updated 2 days ago
        self._insert_session(sid="ta", created_at=now - 10 * 86400, updated_at=now - 2 * 86400, created_by=user_a)
        self._insert_versions(sid="ta", count=5)
        # tb: zero duration (abandoned), 0 versions, author B, updated just now
        self._insert_session(sid="tb", created_at=now, updated_at=now, created_by=user_b)
        # tc: 1 hour lifetime (short), 12 versions, author A, updated just now
        self._insert_session(sid="tc", created_at=now - 3600, updated_at=now, created_by=user_a)
        self._insert_versions(sid="tc", count=12)
        # td: 50 seconds (short), 1 version, orphan author, updated 50s ago
        self._insert_session(sid="td", created_at=now - 100, updated_at=now - 50, created_by="ghost")
        self._insert_versions(sid="td", count=1)

    def _query(self, **overrides):
        params = {
            "sort_by": "version_count",
            "sort_order": "desc",
            "filter_author": "",
            "page": 1,
            "page_size": 20,
        }
        params.update(overrides)
        return self.endpoint(self.request, **params)

    def test_sort_by_version_count_desc(self):
        out = self._query()
        self.assertTrue(bool(out.get("ok")))
        self.assertEqual(out.get("total"), 4)
        ids = [item.get("id") for item in (out.get("items") or [])]
        self.assertEqual(ids, ["tc", "ta", "td", "tb"])
        counts = [item.get("version_count") for item in (out.get("items") or [])]
        self.assertEqual(counts, [12, 5, 1, 0])

    def test_sort_by_lifetime_asc(self):
        out = self._query(sort_by="lifetime", sort_order="asc")
        ids = [item.get("id") for item in (out.get("items") or [])]
        self.assertEqual(ids, ["tb", "td", "tc", "ta"])

    def test_sort_by_last_updated_desc(self):
        out = self._query(sort_by="last_updated", sort_order="desc")
        ids = [item.get("id") for item in (out.get("items") or [])]
        self.assertEqual(ids, ["tb", "tc", "td", "ta"])

    def test_sort_by_author_asc(self):
        out = self._query(sort_by="author", sort_order="asc")
        emails = [item.get("author_email") for item in (out.get("items") or [])]
        self.assertEqual(emails, ["", "author.a@local", "author.a@local", "author.b@local"])

    def test_filter_author(self):
        out = self._query(filter_author="author.a")
        self.assertEqual(out.get("total"), 2)
        ids = sorted(item.get("id") for item in (out.get("items") or []))
        self.assertEqual(ids, ["ta", "tc"])

    def test_pagination_math_and_empty_page(self):
        page1 = self._query(page=1, page_size=2)
        self.assertEqual(page1.get("total"), 4)
        self.assertEqual(page1.get("page"), 1)
        self.assertEqual(page1.get("page_size"), 2)
        self.assertEqual(len(page1.get("items") or []), 2)
        page2 = self._query(page=2, page_size=2)
        self.assertEqual(len(page2.get("items") or []), 2)
        page3 = self._query(page=3, page_size=2)
        self.assertEqual(page3.get("total"), 4)
        self.assertEqual(page3.get("items"), [])
        page_size_cap = self._query(page=1, page_size=500)
        self.assertEqual(page_size_cap.get("page_size"), 100)

    def test_status_and_relative_time(self):
        out = self._query()
        by_id = {item.get("id"): item for item in (out.get("items") or [])}
        self.assertEqual(by_id["ta"].get("status"), "real_work")
        self.assertEqual(by_id["tb"].get("status"), "abandoned")
        self.assertEqual(by_id["tc"].get("status"), "short")
        self.assertEqual(by_id["ta"].get("last_updated_relative"), "2 дня назад")
        self.assertEqual(by_id["tb"].get("last_updated_relative"), "только что")

    def test_auth_admin_restriction_works(self):
        out = self.endpoint(
            self.viewer_request,
            sort_by="version_count",
            sort_order="desc",
            filter_author="",
            page=1,
            page_size=20,
        )
        self.assertEqual(getattr(out, "status_code", 0), 403)


XML_TASK = (
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">'
    '<bpmn:process><bpmn:task id="t1"/></bpmn:process></bpmn:definitions>'
)
XML_TASK_GW = (
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">'
    '<bpmn:process><bpmn:task id="t1"/><bpmn:exclusiveGateway id="g1"/>'
    '<bpmn:sequenceFlow id="f1" sourceRef="t1" targetRef="g1"/>'
    '<bpmn:task id="t2"><bpmn:extensionElements>'
    '<camunda:properties><camunda:property name="ee_time" value="1"/></camunda:properties>'
    '</bpmn:extensionElements></bpmn:task>'
    '</bpmn:process></bpmn:definitions>'
)
XML_NS0 = (
    '<ns0:definitions xmlns:ns0="http://www.omg.org/spec/BPMN/20100524/MODEL">'
    '<ns0:process><ns0:userTask id="u1"/><ns0:startEvent id="e1"/>'
    '<ns0:subProcess id="sp1"/></ns0:process></ns0:definitions>'
)


class AdminSessionAnalyticsCaseStudiesTest(_AnalyticsTestBase):
    def setUp(self):
        super().setUp()
        from app.routers.admin import admin_analytics_sessions_case_studies

        self.endpoint = admin_analytics_sessions_case_studies

    def _insert_version_xml(self, *, sid, number, xml, created_at):
        with self._connect() as con:
            con.execute(
                """
                INSERT INTO bpmn_versions (id, session_id, org_id, version_number, created_at, bpmn_xml)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [f"ver_{sid}_{number}", sid, self.default_org_id, number, created_at, xml],
            )
            con.commit()

    def _seed(self):
        user_a = str(self.user_a.get("id") or "")
        # cs1: 12 versions; changes at v1→v2, then quiet until v12 (ns0 XML).
        self._insert_session(sid="cs1", created_at=1000, updated_at=2000, created_by=user_a)
        for number in range(1, 13):
            xml = XML_TASK if number == 1 else (XML_NS0 if number == 12 else XML_TASK_GW)
            self._insert_version_xml(sid="cs1", number=number, xml=xml, created_at=1000 + number)
        # cs2: only 5 versions — below the min-10 threshold.
        self._insert_session(sid="cs2", created_at=1000, updated_at=1100, created_by=user_a)
        self._insert_versions(sid="cs2", count=5)
        # cs3: 11 versions, no element changes at all.
        self._insert_session(sid="cs3", created_at=1000, updated_at=3000, created_by=user_a)
        for number in range(1, 12):
            self._insert_version_xml(sid="cs3", number=number, xml=XML_TASK, created_at=1000 + number)

    def _query(self, **overrides):
        params = {"limit": 3, "refresh": ""}
        params.update(overrides)
        return self.endpoint(self.request, **params)

    def test_top_by_version_count_with_min_threshold(self):
        out = self._query()
        self.assertTrue(bool(out.get("ok")))
        items = out.get("items") or []
        self.assertEqual([item.get("id") for item in items], ["cs1", "cs3"])
        self.assertEqual([item.get("version_count") for item in items], [12, 11])
        self.assertEqual(items[0].get("duration_seconds"), 1000)
        self.assertEqual(items[0].get("author_email"), "author.a@local")
        self.assertEqual(out.get("min_versions"), 10)

    def test_limit_respected(self):
        out = self._query(limit=1)
        self.assertEqual([item.get("id") for item in (out.get("items") or [])], ["cs1"])

    def test_timeline_compressed_to_change_points_plus_first_last(self):
        out = self._query()
        by_id = {item.get("id"): item for item in (out.get("items") or [])}
        timeline = by_id["cs1"].get("timeline") or []
        self.assertEqual([point.get("version") for point in timeline], [1, 2, 12])
        v1 = timeline[0]
        self.assertEqual((v1.get("tasks"), v1.get("gateways"), v1.get("flows")), (1, 0, 0))
        v2 = timeline[1]
        self.assertEqual((v2.get("tasks"), v2.get("gateways"), v2.get("flows"), v2.get("properties")), (2, 1, 1, 1))
        v12 = timeline[2]
        self.assertEqual((v12.get("tasks"), v12.get("events"), v12.get("subprocesses")), (1, 1, 1))
        # cs3: no changes — first + last only.
        cs3_timeline = by_id["cs3"].get("timeline") or []
        self.assertEqual([point.get("version") for point in cs3_timeline], [1, 11])

    def test_cache_and_refresh(self):
        first = self._query()
        self._insert_version_xml(sid="cs1", number=13, xml=XML_NS0, created_at=2000)
        second = self._query()
        timeline = (second.get("items") or [{}])[0].get("timeline") or []
        self.assertEqual([p.get("version") for p in timeline], [1, 2, 12])
        third = self._query(refresh="true")
        timeline = (third.get("items") or [{}])[0].get("timeline") or []
        self.assertEqual([p.get("version") for p in timeline], [1, 2, 12, 13])
        self.assertTrue(bool(first.get("ok")))

    def test_auth_admin_restriction_works(self):
        out = self.endpoint(self.viewer_request, limit=3, refresh="")
        self.assertEqual(getattr(out, "status_code", 0), 403)


class BpmnElementCountUnitTest(unittest.TestCase):
    def test_counts_bpmn_prefix(self):
        from app.session_analytics import count_bpmn_elements

        counts = count_bpmn_elements(XML_TASK_GW)
        self.assertEqual(counts.get("tasks"), 2)
        self.assertEqual(counts.get("gateways"), 1)
        self.assertEqual(counts.get("flows"), 1)
        self.assertEqual(counts.get("properties"), 1)
        self.assertEqual(counts.get("events"), 0)

    def test_counts_ns_prefix_and_zeebe_property(self):
        from app.session_analytics import count_bpmn_elements

        xml = XML_NS0.replace("</ns0:process>", '<ns0:task id="t9"><ns0:extensionElements><zeebe:properties><zeebe:property name="a" value="b"/></zeebe:properties></ns0:extensionElements></ns0:task></ns0:process>')
        counts = count_bpmn_elements(xml)
        self.assertEqual(counts.get("tasks"), 2)
        self.assertEqual(counts.get("events"), 1)
        self.assertEqual(counts.get("subprocesses"), 1)
        self.assertEqual(counts.get("properties"), 1)

    def test_empty_xml_is_zero(self):
        from app.session_analytics import count_bpmn_elements

        self.assertEqual(count_bpmn_elements(""), {"tasks": 0, "gateways": 0, "events": 0, "flows": 0, "subprocesses": 0, "properties": 0})

    def test_compress_timeline_caps_and_preserves_first_last(self):
        from app.session_analytics import compress_timeline

        points = [{"version": idx, "created_at": idx, "tasks": idx, "gateways": 0, "events": 0, "flows": 0, "subprocesses": 0, "properties": 0} for idx in range(1, 41)]
        out = compress_timeline(points)
        self.assertLessEqual(len(out), 15)
        self.assertEqual(out[0].get("version"), 1)
        self.assertEqual(out[-1].get("version"), 40)


if __name__ == "__main__":
    unittest.main()
