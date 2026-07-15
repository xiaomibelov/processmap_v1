import unittest

from app.services.advanced_calculation import BpmnAnalyzer


SIMPLE_BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
             id="Definitions_1">
  <process id="Process_1">
    <startEvent id="Start_1">
      <outgoing>Flow_1</outgoing>
    </startEvent>
    <task id="Task_1" name="Task A">
      <extensionElements>
        <camunda:properties>
          <camunda:property name="ee_time" value="5.0" />
          <camunda:property name="ingredient_flour" value="2.5" />
          <camunda:property name="ingredient_flour_unit" value="kg" />
          <camunda:property name="resource_worker" value="1" />
        </camunda:properties>
      </extensionElements>
      <incoming>Flow_1</incoming>
      <outgoing>Flow_2</outgoing>
    </task>
    <task id="Task_2" name="Task B">
      <extensionElements>
        <camunda:properties>
          <camunda:property name="ee_time" value="3.0" />
          <camunda:property name="operation_code" value="op-b" />
          <camunda:property name="display_name" value="Display B" />
        </camunda:properties>
      </extensionElements>
      <incoming>Flow_2</incoming>
      <outgoing>Flow_3</outgoing>
    </task>
    <endEvent id="End_1">
      <incoming>Flow_3</incoming>
    </endEvent>
    <sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Task_2" />
    <sequenceFlow id="Flow_3" sourceRef="Task_2" targetRef="End_1" />
  </process>
</definitions>
"""

XOR_BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
             id="Definitions_1">
  <process id="Process_1">
    <startEvent id="Start_1"><outgoing>Flow_1</outgoing></startEvent>
    <task id="Task_1" name="Before split">
      <extensionElements>
        <camunda:properties><camunda:property name="ee_time" value="2" /></camunda:properties>
      </extensionElements>
      <incoming>Flow_1</incoming><outgoing>Flow_2</outgoing>
    </task>
    <exclusiveGateway id="Gateway_1" name="XOR">
      <incoming>Flow_2</incoming><outgoing>Flow_3</outgoing><outgoing>Flow_4</outgoing>
    </exclusiveGateway>
    <task id="Task_2" name="Fast branch">
      <extensionElements>
        <camunda:properties><camunda:property name="ee_time" value="3" /></camunda:properties>
      </extensionElements>
      <incoming>Flow_3</incoming><outgoing>Flow_5</outgoing>
    </task>
    <task id="Task_3" name="Slow branch">
      <extensionElements>
        <camunda:properties><camunda:property name="ee_time" value="10" /></camunda:properties>
      </extensionElements>
      <incoming>Flow_4</incoming><outgoing>Flow_6</outgoing>
    </task>
    <exclusiveGateway id="Gateway_2" name="XOR join">
      <incoming>Flow_5</incoming><incoming>Flow_6</incoming><outgoing>Flow_7</outgoing>
    </exclusiveGateway>
    <task id="Task_4" name="After join">
      <extensionElements>
        <camunda:properties><camunda:property name="ee_time" value="1" /></camunda:properties>
      </extensionElements>
      <incoming>Flow_7</incoming><outgoing>Flow_8</outgoing>
    </task>
    <endEvent id="End_1"><incoming>Flow_8</incoming></endEvent>
    <sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Gateway_1" />
    <sequenceFlow id="Flow_3" sourceRef="Gateway_1" targetRef="Task_2" />
    <sequenceFlow id="Flow_4" sourceRef="Gateway_1" targetRef="Task_3" />
    <sequenceFlow id="Flow_5" sourceRef="Task_2" targetRef="Gateway_2" />
    <sequenceFlow id="Flow_6" sourceRef="Task_3" targetRef="Gateway_2" />
    <sequenceFlow id="Flow_7" sourceRef="Gateway_2" targetRef="Task_4" />
    <sequenceFlow id="Flow_8" sourceRef="Task_4" targetRef="End_1" />
  </process>
</definitions>
"""

PARALLEL_BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
             id="Definitions_1">
  <process id="Process_1">
    <startEvent id="Start_1"><outgoing>Flow_1</outgoing></startEvent>
    <task id="Task_1" name="Before fork">
      <extensionElements>
        <camunda:properties><camunda:property name="ee_time" value="2" /></camunda:properties>
      </extensionElements>
      <incoming>Flow_1</incoming><outgoing>Flow_2</outgoing>
    </task>
    <parallelGateway id="Gateway_1" name="AND fork">
      <incoming>Flow_2</incoming><outgoing>Flow_3</outgoing><outgoing>Flow_4</outgoing>
    </parallelGateway>
    <task id="Task_2" name="Branch A">
      <extensionElements>
        <camunda:properties><camunda:property name="ee_time" value="4" /></camunda:properties>
      </extensionElements>
      <incoming>Flow_3</incoming><outgoing>Flow_5</outgoing>
    </task>
    <task id="Task_3" name="Branch B">
      <extensionElements>
        <camunda:properties><camunda:property name="ee_time" value="8" /></camunda:properties>
      </extensionElements>
      <incoming>Flow_4</incoming><outgoing>Flow_6</outgoing>
    </task>
    <parallelGateway id="Gateway_2" name="AND join">
      <incoming>Flow_5</incoming><incoming>Flow_6</incoming><outgoing>Flow_7</outgoing>
    </parallelGateway>
    <task id="Task_4" name="After join">
      <extensionElements>
        <camunda:properties><camunda:property name="ee_time" value="1" /></camunda:properties>
      </extensionElements>
      <incoming>Flow_7</incoming><outgoing>Flow_8</outgoing>
    </task>
    <endEvent id="End_1"><incoming>Flow_8</incoming></endEvent>
    <sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Gateway_1" />
    <sequenceFlow id="Flow_3" sourceRef="Gateway_1" targetRef="Task_2" />
    <sequenceFlow id="Flow_4" sourceRef="Gateway_1" targetRef="Task_3" />
    <sequenceFlow id="Flow_5" sourceRef="Task_2" targetRef="Gateway_2" />
    <sequenceFlow id="Flow_6" sourceRef="Task_3" targetRef="Gateway_2" />
    <sequenceFlow id="Flow_7" sourceRef="Gateway_2" targetRef="Task_4" />
    <sequenceFlow id="Flow_8" sourceRef="Task_4" targetRef="End_1" />
  </process>
</definitions>
"""

SUBPROCESS_BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
             id="Definitions_1">
  <process id="Process_1">
    <startEvent id="Start_1"><outgoing>Flow_1</outgoing></startEvent>
    <task id="Task_1" name="Outer">
      <extensionElements>
        <camunda:properties><camunda:property name="ee_time" value="2" /></camunda:properties>
      </extensionElements>
      <incoming>Flow_1</incoming><outgoing>Flow_2</outgoing>
    </task>
    <subProcess id="Sub_1" name="My Subprocess">
      <incoming>Flow_2</incoming><outgoing>Flow_3</outgoing>
      <task id="SubTask_1" name="Inner 1">
        <extensionElements>
          <camunda:properties><camunda:property name="ee_time" value="3" /></camunda:properties>
        </extensionElements>
        <incoming>Flow_sub_1</incoming><outgoing>Flow_sub_2</outgoing>
      </task>
      <task id="SubTask_2" name="Inner 2">
        <extensionElements>
          <camunda:properties><camunda:property name="ee_time" value="4" /></camunda:properties>
        </extensionElements>
        <incoming>Flow_sub_2</incoming><outgoing>Flow_sub_3</outgoing>
      </task>
      <startEvent id="SubStart_1"><outgoing>Flow_sub_1</outgoing></startEvent>
      <endEvent id="SubEnd_1"><incoming>Flow_sub_3</incoming></endEvent>
      <sequenceFlow id="Flow_sub_1" sourceRef="SubStart_1" targetRef="SubTask_1" />
      <sequenceFlow id="Flow_sub_2" sourceRef="SubTask_1" targetRef="SubTask_2" />
      <sequenceFlow id="Flow_sub_3" sourceRef="SubTask_2" targetRef="SubEnd_1" />
    </subProcess>
    <endEvent id="End_1"><incoming>Flow_3</incoming></endEvent>
    <sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Sub_1" />
    <sequenceFlow id="Flow_3" sourceRef="Sub_1" targetRef="End_1" />
  </process>
</definitions>
"""

CYCLE_BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
             id="Definitions_1">
  <process id="Process_1">
    <startEvent id="Start_1"><outgoing>Flow_1</outgoing></startEvent>
    <task id="Task_1" name="A">
      <extensionElements>
        <camunda:properties><camunda:property name="ee_time" value="1" /></camunda:properties>
      </extensionElements>
      <incoming>Flow_1</incoming><outgoing>Flow_2</outgoing>
    </task>
    <task id="Task_2" name="B">
      <extensionElements>
        <camunda:properties><camunda:property name="ee_time" value="2" /></camunda:properties>
      </extensionElements>
      <incoming>Flow_2</incoming><outgoing>Flow_3</outgoing>
    </task>
    <exclusiveGateway id="Gateway_1" name="Loop or end">
      <incoming>Flow_3</incoming><outgoing>Flow_4</outgoing><outgoing>Flow_5</outgoing>
    </exclusiveGateway>
    <task id="Task_3" name="C">
      <extensionElements>
        <camunda:properties><camunda:property name="ee_time" value="3" /></camunda:properties>
      </extensionElements>
      <incoming>Flow_4</incoming><outgoing>Flow_6</outgoing>
    </task>
    <task id="Task_1_back" name="Back to A">
      <extensionElements>
        <camunda:properties><camunda:property name="ee_time" value="0.5" /></camunda:properties>
      </extensionElements>
      <incoming>Flow_5</incoming><outgoing>Flow_7</outgoing>
    </task>
    <endEvent id="End_1"><incoming>Flow_6</incoming></endEvent>
    <sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Task_2" />
    <sequenceFlow id="Flow_3" sourceRef="Task_2" targetRef="Gateway_1" />
    <sequenceFlow id="Flow_4" sourceRef="Gateway_1" targetRef="Task_3" />
    <sequenceFlow id="Flow_5" sourceRef="Gateway_1" targetRef="Task_1_back" />
    <sequenceFlow id="Flow_6" sourceRef="Task_3" targetRef="End_1" />
    <sequenceFlow id="Flow_7" sourceRef="Task_1_back" targetRef="Task_1" />
  </process>
</definitions>
"""


class BpmnAnalyzerTests(unittest.TestCase):
    def test_simple_total_ee_time(self):
        analyzer = BpmnAnalyzer(SIMPLE_BPMN)
        self.assertEqual(analyzer.total_ee_time(), 8.0)

    def test_simple_paths(self):
        analyzer = BpmnAnalyzer(SIMPLE_BPMN)
        paths = analyzer.all_paths()
        self.assertEqual(len(paths), 1)
        self.assertEqual(paths[0].total_ee_time, 8.0)
        self.assertTrue(paths[0].is_critical)

    def test_simple_ingredients(self):
        analyzer = BpmnAnalyzer(SIMPLE_BPMN)
        summary, detail = analyzer.ingredients()
        self.assertEqual(len(summary), 1)
        self.assertEqual(summary[0].ingredient_name, "flour")
        self.assertEqual(summary[0].total_quantity, 2.5)
        self.assertEqual(summary[0].unit, "kg")
        self.assertEqual(len(detail), 1)
        self.assertEqual(detail[0].element_id, "Task_1")

    def test_simple_resources(self):
        analyzer = BpmnAnalyzer(SIMPLE_BPMN)
        resources = analyzer.resources()
        self.assertEqual(len(resources), 1)
        self.assertEqual(resources[0].resource_name, "resource_worker")
        self.assertEqual(resources[0].peak_consumption, 1.0)

    def test_simple_coverage(self):
        analyzer = BpmnAnalyzer(SIMPLE_BPMN)
        coverage, summary = analyzer.coverage()
        by_id = {c.element_id: c for c in coverage}
        self.assertTrue(by_id["Task_1"].ee_time_present)
        self.assertTrue(by_id["Task_2"].operation_code_present)
        self.assertTrue(by_id["Task_2"].display_name_present)
        self.assertGreater(summary.average_coverage_score, 0)

    def test_xor_critical_path(self):
        analyzer = BpmnAnalyzer(XOR_BPMN)
        parallel = analyzer.parallel_metrics()
        # critical path = 2 + 10 + 1 = 13
        self.assertEqual(parallel.parallel_time, 13.0)
        self.assertEqual(parallel.sequential_time, 16.0)
        paths = analyzer.all_paths()
        critical = [p for p in paths if p.is_critical]
        self.assertEqual(len(critical), 1)
        self.assertIn("Slow branch", critical[0].description)

    def test_xor_slack(self):
        analyzer = BpmnAnalyzer(XOR_BPMN)
        bottlenecks = analyzer.bottlenecks()
        by_id = {b.element_id: b for b in bottlenecks}
        # Task on fast branch should have positive slack.
        self.assertGreater(by_id["Task_2"].slack, 0)
        # Task on slow branch should be bottleneck.
        self.assertTrue(by_id["Task_3"].is_bottleneck)

    def test_parallel_synchronization_time(self):
        analyzer = BpmnAnalyzer(PARALLEL_BPMN)
        parallel = analyzer.parallel_metrics()
        # AND join waits for slowest branch: 2 + max(4, 8) + 1 = 11
        self.assertEqual(parallel.parallel_time, 11.0)
        self.assertEqual(parallel.sequential_time, 15.0)

    def test_parallel_slack(self):
        analyzer = BpmnAnalyzer(PARALLEL_BPMN)
        bottlenecks = analyzer.bottlenecks()
        by_id = {b.element_id: b for b in bottlenecks}
        # Branch A is faster than branch B -> has slack.
        self.assertGreater(by_id["Task_2"].slack, 0)
        self.assertTrue(by_id["Task_3"].is_bottleneck)

    def test_subprocess_summary(self):
        analyzer = BpmnAnalyzer(SUBPROCESS_BPMN)
        subs = analyzer.subprocess_summary()
        self.assertEqual(len(subs), 1)
        self.assertEqual(subs[0].subprocess_id, "Sub_1")
        # Inner tasks: 3 + 4 = 7
        self.assertEqual(subs[0].total_ee_time, 7.0)

    def test_subprocess_total_ee_time(self):
        analyzer = BpmnAnalyzer(SUBPROCESS_BPMN)
        # Process total includes subprocess contents (outer 2 + inner 3 + 4 = 9).
        self.assertEqual(analyzer.total_ee_time(), 9.0)

    def test_cycle_detection(self):
        analyzer = BpmnAnalyzer(CYCLE_BPMN)
        paths = analyzer.all_paths(max_paths=100)
        # Without cycles we would have infinite paths; with visited-on-path we
        # get: A-B-C-end and A-B-loop-end (Task_1_back revisits A, truncated).
        self.assertGreaterEqual(len(paths), 1)
        self.assertTrue(any("Cycle detected" in w for w in analyzer.warnings))

    def test_no_ee_time_still_works(self):
        xml = SIMPLE_BPMN.replace('name="ee_time" value="5.0"', 'name="ee_time" value=""')
        xml = xml.replace('name="ee_time" value="3.0"', 'name="ee_time" value=""')
        analyzer = BpmnAnalyzer(xml)
        result = analyzer.calculate()
        self.assertEqual(result.total_ee_time, 0.0)
        self.assertEqual(result.parallel.parallel_time, 0.0)
        self.assertEqual(len(result.utilization), 2)
        self.assertEqual(result.utilization[0].utilization_rate, 0.0)

    def test_invalid_xml_raises(self):
        with self.assertRaises(ValueError):
            BpmnAnalyzer("not valid xml")


if __name__ == "__main__":
    unittest.main()


import os
import sqlite3
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


class AdvancedCalculationRouterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_db_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_database_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["PROCESS_DB_PATH"] = str(Path(self.tmp.name) / "processmap.sqlite3")
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

        from app.auth import create_access_token, create_user
        from app.startup.app_factory import create_app
        from app.storage import get_default_org_id, get_storage, list_org_workspaces

        self.app = create_app()
        self.client = TestClient(self.app)
        self.org_id = get_default_org_id()
        self.admin = create_user("analytics-admin-adv@local", "admin", is_admin=False)
        self.viewer = create_user("analytics-viewer-adv@local", "viewer", is_admin=False)
        self.other = create_user("analytics-other-adv@local", "viewer", is_admin=False)
        self.admin_id = str(self.admin.get("id") or "")
        self.viewer_id = str(self.viewer.get("id") or "")
        self.other_id = str(self.other.get("id") or "")
        self._insert_membership(self.org_id, self.admin_id, "org_admin")
        self._insert_membership(self.org_id, self.viewer_id, "viewer")
        self._insert_membership(self.org_id, self.other_id, "viewer")

        self.workspace_id = str(list_org_workspaces(self.org_id)[0].get("id") or "")
        from app.storage import get_project_storage

        self.project_id = get_project_storage().create("Advanced Calc Project", {}, user_id=self.admin_id, org_id=self.org_id, is_admin=True)
        from app.storage import upsert_project_membership

        upsert_project_membership(self.org_id, self.project_id, self.viewer_id, "viewer")
        self.session_id = get_storage().create(
            "Advanced Calc Session",
            project_id=self.project_id,
            user_id=self.admin_id,
            org_id=self.org_id,
            is_admin=True,
        )

        self._set_session_bpmn_xml(SIMPLE_BPMN)

        self.admin_token = create_access_token(self.admin_id)
        self.viewer_token = create_access_token(self.viewer_id)
        self.other_token = create_access_token(self.other_id)

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
        try:
            from app.db.config import get_db_runtime_config

            get_db_runtime_config.cache_clear()
            import app.storage as storage_module

            storage_module._SCHEMA_READY = False
            storage_module._SCHEMA_DB_FILE = ""
            storage_module._PG_POOL = None
        except Exception:
            pass
        self.tmp.cleanup()

    def _db_path(self) -> Path:
        return Path(self.tmp.name) / "processmap.sqlite3"

    def _insert_membership(self, org_id: str, user_id: str, role: str):
        from app.storage import get_storage

        _ = get_storage()
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

    def _headers(self, token: str):
        return {"Authorization": f"Bearer {token}"}

    def _set_session_bpmn_xml(self, xml: str):
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                "UPDATE sessions SET bpmn_xml = ? WHERE id = ? AND org_id = ?",
                (xml, self.session_id, self.org_id),
            )
            con.commit()

    def test_export_advanced_calculation_requires_auth(self):
        r = self.client.get(
            f"/api/analytics/export-advanced-calculation.xlsx?scope=session&scope_id={self.session_id}",
        )
        self.assertEqual(r.status_code, 401)

    def test_export_advanced_calculation_forbidden_for_non_member(self):
        r = self.client.get(
            f"/api/analytics/export-advanced-calculation.xlsx?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.other_token),
        )
        self.assertEqual(r.status_code, 403)

    def test_export_advanced_calculation_404_unknown_session(self):
        r = self.client.get(
            "/api/analytics/export-advanced-calculation.xlsx?scope=session&scope_id=unknown",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 404)

    def test_export_advanced_calculation_422_invalid_xml(self):
        self._set_session_bpmn_xml("not valid xml")
        r = self.client.get(
            f"/api/analytics/export-advanced-calculation.xlsx?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 422)

    def test_export_advanced_calculation_returns_valid_xlsx(self):
        r = self.client.get(
            f"/api/analytics/export-advanced-calculation.xlsx?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            r.headers["content-type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn("advanced_calculation_", r.headers.get("content-disposition", ""))
        self.assertTrue(r.content.startswith(b"PK"))
        self.assertGreater(len(r.content), 100)

    def test_export_advanced_calculation_no_ee_time_returns_xlsx(self):
        xml = SIMPLE_BPMN.replace('name="ee_time" value="5.0"', 'name="ee_time" value=""')
        xml = xml.replace('name="ee_time" value="3.0"', 'name="ee_time" value=""')
        self._set_session_bpmn_xml(xml)
        r = self.client.get(
            f"/api/analytics/export-advanced-calculation.xlsx?scope=session&scope_id={self.session_id}",
            headers=self._headers(self.admin_token),
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.content.startswith(b"PK"))


if __name__ == "__main__":
    unittest.main()
