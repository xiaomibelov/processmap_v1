"""GET /api/admin/dashboard — capability_map + attention.

Контур: feature/admin-dashboard-v2-feature-map.
Прогон: python -m pytest tests/test_admin_dashboard_capability_map.py
"""

import os
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in __import__("sys").path:
    import sys

    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(
            auth_user=user,
            active_org_id=active_org_id,
            org_id=active_org_id,
            org_memberships=[],
        )
        self.headers = {}


def _base_payload(**over):
    payload = {
        "ok": True,
        "generated_at": "2026-09-20T00:00:00+00:00",
        "org": {"id": "org1", "name": "Org"},
        "kpis": {
            "organizations": 1,
            "projects": 0,
            "active_sessions": 0,
            "autopass_success_rate_pct": None,
            "failed_jobs": 0,
            "avg_save_latency_ms": None,
            "published_bpmn_versions": 0,
            "mirrored_to_git": 0,
            "mirror_failed": 0,
        },
        "charts": {
            "sessions_activity": [],
            "autopass_outcomes": {"runs": 0, "done": 0, "failed": 0, "success_rate_pct": None},
            "report_doc_health": {"reports_ready": 0, "doc_ready": 0, "pending": 0, "completion_rate_pct": None},
        },
        "jobs_health": {
            "queue_depth": 0,
            "autopass_runs": 0,
            "autopass_done": 0,
            "autopass_failed": 0,
            "lock_busy_total": 0,
            "avg_duration_s": 0,
        },
        "requires_attention": [],
        "recent_failures": [],
        "recent_audit": [],
        "template_usage": {
            "total_templates": 0,
            "active_templates": 0,
            "cross_session_templates": 0,
            "broken_anchor_templates": 0,
        },
        "publish_git_mirror": {
            "published_bpmn_versions": 0,
            "not_attempted": 0,
            "skipped_disabled": 0,
            "skipped_invalid_config": 0,
            "pending": 0,
            "mirrored_to_git": 0,
            "failed": 0,
            "latest_attempt_at": 0,
            "latest_attempt_at_iso": "",
            "latest_result_state": "",
            "org_mirror_enabled": False,
            "org_mirror_health_status": "unknown",
        },
        "redis_health": {
            "mode": "ON",
            "state": "ok",
            "queue_enabled": False,
            "queue_depth": 0,
            "lock_busy_total": 0,
            "degraded": False,
            "incident": False,
            "required": False,
            "configured": False,
            "available": False,
            "reason": "",
        },
    }
    payload.update(over)
    return payload


def _capability(domains, cap_id):
    for domain in domains:
        for cap in domain.get("capabilities", []):
            if cap.get("id") == cap_id:
                return cap
    return None


def _attention_kind(attention, kind):
    return next((item for item in attention if item.get("kind") == kind), None)


def _map_kwargs(**over):
    kwargs = {
        "flags": {},
        "env_flags": {"FPC_ASYNC_SUBPROCESS_SYNC": False},
        "llm_provider_errors_24h": 0,
        "rag_readiness": None,
        "graph_freshness_iso": "",
    }
    kwargs.update(over)
    return kwargs


class CapabilityMapUnitTests(unittest.TestCase):
    def setUp(self):
        from app.admin_capability_map import build_attention, build_capability_map

        self.build_attention = build_attention
        self.build_capability_map = build_capability_map

    def test_empty_sources_are_no_data(self):
        domains = self.build_capability_map(_base_payload(), **_map_kwargs())
        self.assertEqual(len(domains), 7)
        for cap_id in (
            "save_pipeline",
            "projects_sessions",
            "immutable_versions",
            "audit_log",
            "graphs",
            "nightly_snapshot",
        ):
            cap = _capability(domains, cap_id)
            self.assertIsNotNone(cap, cap_id)
            self.assertEqual(cap.get("status"), "no_data", cap_id)
        self.assertEqual(
            _capability(domains, "async_subprocess_sync").get("status"),
            "off",
        )
        self.assertEqual(self.build_attention(_base_payload(), llm_provider_errors_24h=0), [])

    def test_autopass_failed_attention(self):
        payload = _base_payload()
        payload["charts"] = {
            "sessions_activity": [],
            "autopass_outcomes": {"runs": 40, "done": 10, "failed": 30, "success_rate_pct": 25},
            "report_doc_health": {},
        }
        attention = self.build_attention(payload, llm_provider_errors_24h=0)
        item = _attention_kind(attention, "autopass_failed")
        self.assertIsNotNone(item)
        self.assertEqual(item.get("count"), 30)

    def test_mirror_org_disabled_is_off_and_not_in_attention(self):
        payload = _base_payload()
        payload["publish_git_mirror"] = {**payload["publish_git_mirror"], "failed": 5, "org_mirror_enabled": False}
        domains = self.build_capability_map(payload, **_map_kwargs())
        self.assertEqual(_capability(domains, "git_mirror").get("status"), "off")
        attention = self.build_attention(payload, llm_provider_errors_24h=0)
        self.assertIsNone(_attention_kind(attention, "mirror_failed"))

    def test_mirror_org_enabled_with_failures_is_attention(self):
        payload = _base_payload()
        payload["publish_git_mirror"] = {**payload["publish_git_mirror"], "failed": 2, "org_mirror_enabled": True}
        domains = self.build_capability_map(payload, **_map_kwargs())
        self.assertEqual(_capability(domains, "git_mirror").get("status"), "attention")
        attention = self.build_attention(payload, llm_provider_errors_24h=0)
        self.assertEqual(_attention_kind(attention, "mirror_failed").get("count"), 2)

    def test_tobe_flag_on_is_pilot(self):
        domains = self.build_capability_map(
            _base_payload(),
            **_map_kwargs(flags={"workspace_tobe_overview": True}),
        )
        cap = _capability(domains, "tobe_overview")
        self.assertEqual(cap.get("status"), "pilot")
        self.assertIn("TOBE_OVERVIEW_PILOT_ORG_IDS", cap.get("fact", ""))

    def test_llm_errors_attention_and_capability(self):
        payload = _base_payload()
        attention = self.build_attention(payload, llm_provider_errors_24h=7)
        item = _attention_kind(attention, "llm_provider_errors")
        self.assertIsNotNone(item)
        self.assertEqual(item.get("count"), 7)
        domains = self.build_capability_map(payload, **_map_kwargs(llm_provider_errors_24h=7))
        self.assertEqual(_capability(domains, "execution_log").get("status"), "attention")

    def test_llm_errors_zero_no_attention(self):
        payload = _base_payload()
        self.assertIsNone(
            _attention_kind(self.build_attention(payload, llm_provider_errors_24h=0), "llm_provider_errors")
        )
        domains = self.build_capability_map(payload, **_map_kwargs(llm_provider_errors_24h=0))
        self.assertEqual(_capability(domains, "execution_log").get("status"), "ok")

    def test_redis_degraded_and_incident_attention(self):
        payload = _base_payload()
        payload["redis_health"] = {**payload["redis_health"], "degraded": True, "incident": True}
        attention = self.build_attention(payload, llm_provider_errors_24h=0)
        self.assertIsNotNone(_attention_kind(attention, "redis_degraded"))
        self.assertIsNotNone(_attention_kind(attention, "redis_incident"))

    def test_sessions_warnings_attention(self):
        payload = _base_payload()
        payload["requires_attention"] = [{"session_id": "s1", "warnings_count": 3}]
        attention = self.build_attention(payload, llm_provider_errors_24h=0)
        self.assertEqual(_attention_kind(attention, "sessions_warnings").get("count"), 1)

    def test_graph_freshness_present_is_ok(self):
        domains = self.build_capability_map(
            _base_payload(),
            **_map_kwargs(graph_freshness_iso="2026-09-20T01:00:00+00:00"),
        )
        cap = _capability(domains, "graphs")
        self.assertEqual(cap.get("status"), "ok")
        self.assertIn("2026-09-20", cap.get("fact", ""))


class LlmProviderErrorsWindowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_db_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "cap_map.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        import importlib

        import app.storage as storage

        importlib.reload(storage)
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        storage._AGENT_TABLES_READY = False
        storage._AGENT_TABLES_DB_FILE = ""

        from app.storage import get_default_org_id

        self.org_id = get_default_org_id()

        from app.admin_capability_map import count_llm_provider_errors
        from app.ai.execution_log import record_ai_execution

        self.count_errors = count_llm_provider_errors
        self.record = record_ai_execution

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

    def test_window_boundary_24h(self):
        now = int(time.time())
        # Ровно 24ч назад — НЕ считается (окно (now-86400, now]).
        self.record(
            module_id="ai.test",
            scope={"org_id": self.org_id},
            status="error",
            created_at=now - 86400,
        )
        # 23:59 назад — считается.
        self.record(
            module_id="ai.test",
            scope={"org_id": self.org_id},
            status="error",
            created_at=now - 86400 + 60,
        )
        # success в окне — не считается.
        self.record(
            module_id="ai.test",
            scope={"org_id": self.org_id},
            status="success",
            created_at=now - 100,
        )
        # error другой орги — не считается.
        self.record(
            module_id="ai.test",
            scope={"org_id": "org_other"},
            status="error",
            created_at=now - 100,
        )
        self.assertEqual(self.count_errors(self.org_id, now_ts=now), 1)
        # Сдвинутое окно (now+60): нижняя граница now-86340 эксклюзивна —
        # запись ровно на границе (B) уже вне окна.
        self.assertEqual(self.count_errors(self.org_id, now_ts=now + 60), 0)


class AdminDashboardCapabilityMapIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_db_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "dash_cap_map.sqlite3")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        import importlib

        import app.storage as storage

        importlib.reload(storage)
        storage._SCHEMA_READY = False
        storage._SCHEMA_DB_FILE = ""
        storage._AGENT_TABLES_READY = False
        storage._AGENT_TABLES_DB_FILE = ""

        from app.auth import create_user
        from app.storage import get_default_org_id

        self.org_id = get_default_org_id()
        self.admin = create_user("dash_cap_admin@local", "adminpass", is_admin=True)

        import app.routers.admin as admin_module

        self.admin_module = admin_module
        self.request = _DummyRequest(self.admin, active_org_id=self.org_id)

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

    def _patches(self, *, snapshots):
        module = self.admin_module
        workspace = {
            "org": {
                "id": self.org_id,
                "name": "Org",
                "git_mirror_enabled": False,
                "git_health_status": "unknown",
            },
            "sessions": [],
            "projects": [],
        }
        return [
            patch.object(module, "_workspace_payload", return_value=(workspace, None)),
            patch.object(module, "_session_meta_map", return_value={}),
            patch.object(module, "list_templates", return_value=[]),
            patch.object(module, "list_audit_log", return_value=[]),
            patch.object(
                module,
                "runtime_status",
                return_value={
                    "mode": "ON",
                    "state": "ok",
                    "required": False,
                    "configured": True,
                    "available": True,
                    "reason": "",
                },
            ),
            patch.object(module, "redis_queue_enabled", return_value=False),
            patch.object(module, "get_client", return_value=None),
            patch.object(module, "resolve_runtime_flags", return_value={}),
            patch.object(module, "count_llm_provider_errors_conn", return_value=0),
            patch.object(
                module,
                "_rag_readiness_counts",
                return_value={"not_ready": 0, "queued": 0, "indexed": 0, "error": 0},
            ),
            patch.object(module, "list_snapshots", return_value=snapshots),
        ]

    def _run_dashboard(self, *, snapshots):
        with_patent = self._patches(snapshots=snapshots)
        for p in with_patent:
            p.start()
        try:
            return self.admin_module.admin_dashboard(self.request)
        finally:
            for p in reversed(with_patent):
                p.stop()

    def test_existing_payload_keys_regression(self):
        result = self._run_dashboard(snapshots=[])
        for key in (
            "ok",
            "generated_at",
            "org",
            "kpis",
            "charts",
            "jobs_health",
            "requires_attention",
            "recent_failures",
            "recent_audit",
            "template_usage",
            "publish_git_mirror",
            "redis_health",
        ):
            self.assertIn(key, result, f"потерян существующий ключ {key}")
        for key in ("attention", "capability_map"):
            self.assertIn(key, result, f"отсутствует новый ключ {key}")
        self.assertIsInstance(result.get("attention"), list)
        self.assertEqual(len(result.get("capability_map") or []), 7)

    def test_dashboard_graph_freshness_no_data_when_no_snapshots(self):
        result = self._run_dashboard(snapshots=[])
        cap = _capability(result.get("capability_map", []), "graphs")
        self.assertEqual(cap.get("status"), "no_data")

    def test_dashboard_graph_freshness_ok_with_snapshot(self):
        result = self._run_dashboard(snapshots=[{"created_at": "2026-09-20T02:00:00+00:00"}])
        cap = _capability(result.get("capability_map", []), "graphs")
        self.assertEqual(cap.get("status"), "ok")


if __name__ == "__main__":
    unittest.main()
