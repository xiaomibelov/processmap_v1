import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class ProcessAnalysisReadModelTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_db_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_database_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.pop("PROCESS_DB_PATH", None)
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        from app.db.config import get_db_runtime_config

        get_db_runtime_config.cache_clear()
        try:
            import app.storage as storage_module

            storage_module._SCHEMA_READY = False
            storage_module._SCHEMA_DB_FILE = ""
            storage_module._PG_POOL = None
        except Exception:
            pass

        from app.auth import create_user
        from app.routers.product_actions_registry import get_session_analysis_view_model
        from app.storage import (
            get_default_org_id,
            get_project_storage,
            get_storage,
            list_org_workspaces,
            upsert_project_membership,
        )

        self.get_session_analysis_view_model = get_session_analysis_view_model
        self.get_storage = get_storage
        self.org_id = get_default_org_id()
        self.admin = create_user("pa-admin@local", "admin", is_admin=False)
        self.viewer = create_user("pa-viewer@local", "viewer", is_admin=False)
        self.admin_id = str(self.admin.get("id") or "")
        self.viewer_id = str(self.viewer.get("id") or "")
        self._insert_membership(self.org_id, self.admin_id, "org_admin")
        self._insert_membership(self.org_id, self.viewer_id, "viewer")

        self.workspace_id = str(list_org_workspaces(self.org_id)[0].get("id") or "")
        self.project_id = get_project_storage().create(
            "PA Project", {}, user_id=self.admin_id, org_id=self.org_id, is_admin=True
        )
        upsert_project_membership(self.org_id, self.project_id, self.viewer_id, "viewer")

    def tearDown(self):
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        if self.old_db_backend is None:
            os.environ.pop("FPC_DB_BACKEND", None)
        else:
            os.environ["FPC_DB_BACKEND"] = self.old_db_backend
        if self.old_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self.old_database_url
        self.tmp.cleanup()

    def _db_path(self) -> Path:
        return Path(self.tmp.name) / "processmap.sqlite3"

    def _insert_membership(self, org_id: str, user_id: str, role: str):
        _ = self.get_storage()
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                """
                INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at)
                VALUES (?, ?, ?, strftime('%s','now'))
                """,
                [org_id, user_id, role],
            )
            con.execute(
                "UPDATE org_memberships SET role = ? WHERE org_id = ? AND user_id = ?",
                [role, org_id, user_id],
            )
            con.commit()

    def _req(self, user: dict):
        return _DummyRequest(user, active_org_id=self.org_id)

    def _seed_session(self, title: str, interview: dict, *, diagram_state_version: int = 1):
        storage = self.get_storage()
        sid = storage.create(
            title, project_id=self.project_id, user_id=self.admin_id, org_id=self.org_id, is_admin=True
        )
        session = storage.load(sid, org_id=self.org_id, is_admin=True)
        session.interview = interview
        session.bpmn_xml = (
            '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">'
            '<bpmn:task id="Task_1" name="Task 1"/><bpmn:task id="Task_2" name="Task 2"/></bpmn:definitions>'
        )
        session.diagram_state_version = diagram_state_version
        storage.save(session, org_id=self.org_id, is_admin=True)
        return sid

    def _get_process_metrics(self, sid: str):
        out = self.get_session_analysis_view_model(sid, self._req(self.admin))
        self.assertTrue(out.get("ok"))
        return out["analysis"]["derived"]["process_metrics"]

    def test_empty_session_returns_zero_metrics(self):
        sid = self._seed_session(
            "Empty", {"boundaries": {}, "steps": [], "exceptions": [], "ai_questions": {}}
        )
        m = self._get_process_metrics(sid)
        self.assertEqual(m["time"]["active_min"], 0)
        self.assertEqual(m["time"]["wait_min"], 0)
        self.assertEqual(m["time"]["lead_min"], 0)
        self.assertEqual(m["time"]["mainline_min"], 0)
        self.assertEqual(m["time"]["throughput_steps_per_hour"], 0.0)
        self.assertEqual(m["counts"]["steps_total"], 0)
        self.assertEqual(m["coverage"]["bind_percent"], 0)
        self.assertEqual(m["exceptions"]["count"], 0)
        self.assertEqual(m["source_state"]["source"], "process_analysis_read_model")
        self.assertEqual(m["source_state"]["version"], "v1")

    def test_time_metrics_from_step_durations(self):
        interview = {
            "steps": [
                {
                    "id": "s1",
                    "action": "Нарезка",
                    "duration_min": 20,
                    "wait_min": 5,
                    "node_id": "Task_1",
                    "type": "task",
                    "lane_name": "Повар",
                },
                {
                    "id": "s2",
                    "action": "Упаковка",
                    "duration_min": 10,
                    "wait_min": 0,
                    "node_id": "Task_2",
                    "type": "task",
                    "lane_name": "Упаковщик",
                },
                {
                    "id": "s3",
                    "action": "Охлаждение",
                    "duration_min": 0,
                    "wait_min": 30,
                    "type": "waiting",
                    "lane_name": "Склад",
                },
            ],
            "boundaries": {"trigger": "заказ", "start_shop": "кухня"},
            "exceptions": [],
            "ai_questions": {},
        }
        sid = self._seed_session("Time", interview)
        m = self._get_process_metrics(sid)
        self.assertEqual(m["time"]["active_min"], 30)
        self.assertEqual(m["time"]["wait_min"], 35)
        self.assertEqual(m["time"]["lead_min"], 65)
        self.assertEqual(m["time"]["mainline_min"], 30)
        self.assertEqual(m["time"]["throughput_steps_per_hour"], round((3 * 60) / 65, 1))

    def test_path_metrics(self):
        interview = {
            "steps": [
                {"id": "s1", "action": "A", "duration_sec": 600, "wait_sec": 120},
                {"id": "s2", "action": "B", "duration_sec": 300, "wait_sec": 60},
            ],
            "boundaries": {},
            "exceptions": [],
            "ai_questions": {},
        }
        sid = self._seed_session("Path", interview)
        m = self._get_process_metrics(sid)
        self.assertEqual(m["path_metrics"]["steps_count"], 2)
        self.assertEqual(m["path_metrics"]["work_time_total_sec"], 900)
        self.assertEqual(m["path_metrics"]["wait_time_total_sec"], 180)
        self.assertEqual(m["path_metrics"]["total_time_sec"], 1080)

    def test_boundaries_coverage(self):
        interview = {
            "steps": [],
            "boundaries": {
                "trigger": "заказ",
                "start_shop": "",
                "intermediate_roles": "",
                "finish_state": "готово",
                "finish_shop": "",
            },
            "exceptions": [],
            "ai_questions": {},
        }
        sid = self._seed_session("Boundaries", interview)
        m = self._get_process_metrics(sid)
        self.assertEqual(m["coverage"]["boundaries"]["filled"], 2)
        self.assertEqual(m["coverage"]["boundaries"]["total"], 5)
        self.assertEqual(m["coverage"]["boundaries"]["percent"], 40)

    def test_exceptions_aggregation(self):
        interview = {
            "steps": [],
            "boundaries": {},
            "exceptions": [
                {"id": "e1", "add_min": 10},
                {"id": "e2", "addMin": 5},
                {"id": "e3", "add_min": 0},
            ],
            "ai_questions": {},
        }
        sid = self._seed_session("Exceptions", interview)
        m = self._get_process_metrics(sid)
        self.assertEqual(m["exceptions"]["count"], 3)
        self.assertEqual(m["exceptions"]["add_min_total"], 15)

    def test_ai_coverage(self):
        interview = {
            "steps": [
                {"id": "s1", "action": "A", "duration_min": 1},
                {"id": "s2", "action": "B", "duration_min": 1},
            ],
            "boundaries": {},
            "exceptions": [],
            "ai_questions": {
                "s1": [
                    {"qid": "q1", "text": "Вопрос 1", "status": "done"},
                    {"qid": "q2", "text": "Вопрос 2", "status": "open"},
                ],
            },
            "ai_questions_by_element": {
                "Task_2": [
                    {"qid": "q3", "text": "Вопрос 3", "status": "open"},
                ],
            },
        }
        sid = self._seed_session("AI", interview)
        m = self._get_process_metrics(sid)
        self.assertEqual(m["coverage"]["ai"]["total"], 3)
        self.assertEqual(m["coverage"]["ai"]["done"], 1)
        self.assertEqual(m["coverage"]["ai"]["open"], 2)
        self.assertEqual(m["coverage"]["ai"]["step_coverage_percent"], 50)

    def test_top_waits_and_extremes(self):
        interview = {
            "steps": [
                {"id": "s1", "action": "Нарезка", "duration_min": 20, "wait_min": 5, "seq_label": "1"},
                {"id": "s2", "action": "Упаковка", "duration_min": 10, "wait_min": 15, "seq_label": "2"},
                {"id": "s3", "action": "Охлаждение", "duration_min": 0, "wait_min": 30, "seq_label": "3"},
            ],
            "boundaries": {},
            "exceptions": [],
            "ai_questions": {},
        }
        sid = self._seed_session("TopWaits", interview)
        m = self._get_process_metrics(sid)
        self.assertEqual(len(m["top_waits"]), 3)
        self.assertEqual(m["top_waits"][0]["title"], "Охлаждение")
        self.assertEqual(m["top_waits"][0]["wait_min"], 30)
        self.assertEqual(m["extremes"]["max_duration_step"]["title"], "Нарезка")
        self.assertEqual(m["extremes"]["max_duration_step"]["duration_min"], 20)
        self.assertEqual(m["extremes"]["max_wait_step"]["title"], "Охлаждение")
        self.assertEqual(m["extremes"]["max_wait_step"]["wait_min"], 30)

    def test_distributions(self):
        interview = {
            "steps": [
                {"id": "s1", "action": "A", "duration_min": 20, "type": "task", "lane_name": "Повар", "subprocess": "Приготовление"},
                {"id": "s2", "action": "B", "duration_min": 10, "type": "task", "lane_name": "Повар", "subprocess": "Приготовление"},
                {"id": "s3", "action": "C", "duration_min": 5, "type": "movement", "lane_name": "Упаковщик", "subprocess": "Упаковка"},
            ],
            "boundaries": {},
            "exceptions": [],
            "ai_questions": {},
        }
        sid = self._seed_session("Distributions", interview)
        m = self._get_process_metrics(sid)
        by_type = {x["key"]: x for x in m["distributions"]["by_type"]}
        self.assertEqual(by_type["task"]["count"], 2)
        self.assertEqual(by_type["task"]["share_percent"], 67)
        by_lane = {x["key"]: x for x in m["distributions"]["by_lane"]}
        self.assertEqual(by_lane["повар"]["count"], 2)
        by_sp = {x["key"]: x for x in m["distributions"]["by_subprocess"]}
        self.assertEqual(by_sp["приготовление"]["count"], 2)

    def test_tier_counts(self):
        interview = {
            "steps": [
                {"id": "s1", "action": "A", "duration_min": 1, "tier": "P0"},
                {"id": "s2", "action": "B", "duration_min": 1, "tier": "P0"},
                {"id": "s3", "action": "C", "duration_min": 1, "tier": "P1"},
                {"id": "s4", "action": "D", "duration_min": 1},
            ],
            "boundaries": {},
            "exceptions": [],
            "ai_questions": {},
        }
        sid = self._seed_session("Tiers", interview)
        m = self._get_process_metrics(sid)
        self.assertEqual(m["counts"]["tiers"], {"P0": 2, "P1": 1, "P2": 0, "None": 1})

    def test_response_contract_and_no_heavy_payload(self):
        interview = {
            "steps": [{"id": "s1", "action": "A", "duration_min": 1}],
            "boundaries": {},
            "exceptions": [],
            "ai_questions": {},
        }
        sid = self._seed_session("Contract", interview, diagram_state_version=42)
        out = self.get_session_analysis_view_model(sid, self._req(self.admin))
        self.assertTrue(out.get("ok"))
        self.assertEqual(out.get("session_id"), sid)
        derived = out["analysis"]["derived"]
        self.assertIn("step_action_counts", derived)
        self.assertIn("process_metrics", derived)
        self.assertEqual(derived["process_metrics"]["source_state"]["diagram_state_version"], 42)
        for heavy_key in ("bpmn_xml", "interview", "bpmn_meta"):
            self.assertNotIn(heavy_key, out)


if __name__ == "__main__":
    unittest.main()
