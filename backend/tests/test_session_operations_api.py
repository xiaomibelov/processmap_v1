"""API tests for POST /api/sessions/{id}/operations (feature/async-save-pipeline-step1).

Матрица — TESTS.md §2.1: happy path, идемпотентность, частичный retry, 409,
422 + rollback, Redis 423, CAS race, source persisted, TTL cleanup.
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
import threading
import time
import unittest
import uuid
from unittest.mock import patch

import xml.etree.ElementTree as ET

from fastapi.testclient import TestClient

SAMPLE_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Definitions_ops" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_ops" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Old name">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_2" name="Second task">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Task_2" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_2" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_ops">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="172" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="260" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_2_di" bpmnElement="Task_2">
        <dc:Bounds x="420" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="592" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="208" y="120" />
        <di:waypoint x="260" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="360" y="120" />
        <di:waypoint x="420" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="520" y="120" />
        <di:waypoint x="592" y="120" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""

BPMN_NS = "{http://www.omg.org/spec/BPMN/20100524/MODEL}"
DC_NS = "{http://www.omg.org/spec/DD/20100524/DC}"
DI_NS = "{http://www.omg.org/spec/DD/20100524/DI}"
BPMNDI_NS = "{http://www.omg.org/spec/BPMN/20100524/DI}"


def _find_by_id(root: ET.Element, element_id: str) -> ET.Element | None:
    for el in root.iter():
        if el.get("id") == element_id:
            return el
    return None


def _di_bounds(root: ET.Element, element_id: str) -> ET.Element | None:
    for el in root.iter():
        if el.tag == f"{BPMNDI_NS}BPMNShape" and el.get("bpmnElement") == element_id:
            for ch in el:
                if ch.tag == f"{DC_NS}Bounds":
                    return ch
    return None


def _di_waypoints(root: ET.Element, element_id: str) -> list[ET.Element]:
    for el in root.iter():
        if el.tag == f"{BPMNDI_NS}BPMNEdge" and el.get("bpmnElement") == element_id:
            return [ch for ch in el if ch.tag == f"{DI_NS}waypoint"]
    return []


class SessionOperationsApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_redis_url = os.environ.get("REDIS_URL")
        self.old_cas_bypass = os.environ.get("FPC_E2E_CAS_BYPASS")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.pop("REDIS_URL", None)
        os.environ.pop("FPC_E2E_CAS_BYPASS", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")

        from app.auth import create_access_token, create_user
        from app.main import app
        from app.storage import get_storage

        self.client = TestClient(app)
        self.st = get_storage()
        # Celery/Redis в unit-окружении недоступны: RAG-enqueue после save
        # уходит в retry-storm (~20s). Тесты контура enqueue не покрывают.
        enqueue_patch = patch.object(
            type(self.st), "_enqueue_rag_index_after_version", lambda *args, **kwargs: None
        )
        enqueue_patch.start()
        self.addCleanup(enqueue_patch.stop)
        suffix = uuid.uuid4().hex
        self.owner = create_user(f"owner_ops_{suffix}@local", "password", is_admin=True)
        self.token = create_access_token(str(self.owner["id"]))
        self.sid = self.st.create(title=f"ops-session-{suffix}", user_id=str(self.owner["id"]))
        sess = self.st.load(self.sid, is_admin=True)
        sess.bpmn_xml = SAMPLE_BPMN_XML
        sess.diagram_state_version = 7
        self.st.save(sess)
        self.base_version = 7

    def tearDown(self):
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_redis_url is None:
            os.environ.pop("REDIS_URL", None)
        else:
            os.environ["REDIS_URL"] = self.old_redis_url
        if self.old_cas_bypass is not None:
            os.environ["FPC_E2E_CAS_BYPASS"] = self.old_cas_bypass
        self.tmp.cleanup()

    # --- helpers -------------------------------------------------------

    def _post(self, body):
        return self.client.post(
            f"/api/sessions/{self.sid}/operations",
            json=body,
            headers={"Authorization": f"Bearer {self.token}"},
        )

    def _db_rows(self, sql, params=()):
        path = os.environ.get("PROCESS_DB_PATH")
        con = sqlite3.connect(path)
        try:
            return con.execute(sql, params).fetchall()
        finally:
            con.close()

    def _loaded_xml(self) -> str:
        return str(getattr(self.st.load(self.sid, is_admin=True), "bpmn_xml", "") or "")

    def _op(self, op_id, op_type, **payload):
        return {"opId": op_id, "type": op_type, **payload}

    # --- tests ---------------------------------------------------------

    def test_happy_path_batch_bumps_version_once(self):
        before = self.st.load(self.sid, is_admin=True)
        before_updated_at = int(getattr(before, "updated_at", 0) or 0)
        # updated_at has 1s granularity: ensure the request lands in the
        # next second so the bump is observable.
        time.sleep(1.05)
        resp = self._post({
            "baseVersion": self.base_version,
            "operations": [
                self._op("op-1", "element.updateProperties", elementId="Task_1", properties={"name": "New name"}),
                self._op("op-2", "shape.move", elementId="Task_1", x=300, y=200),
                self._op("op-3", "element.updateDi", elementId="Flow_1", waypoints=[[210, 130], [300, 230]]),
            ],
        })
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        self.assertTrue(body.get("ok"))
        self.assertEqual(body.get("version"), self.base_version + 1)
        self.assertEqual(body.get("applied"), 3)
        self.assertEqual(body.get("skipped"), 0)

        root = ET.fromstring(self._loaded_xml())
        self.assertEqual(_find_by_id(root, "Task_1").get("name"), "New name")
        bounds = _di_bounds(root, "Task_1")
        self.assertEqual((bounds.get("x"), bounds.get("y")), ("300", "200"))
        waypoints = _di_waypoints(root, "Flow_1")
        self.assertEqual(len(waypoints), 2)
        self.assertEqual((waypoints[0].get("x"), waypoints[0].get("y")), ("210", "130"))

        after = self.st.load(self.sid, is_admin=True)
        self.assertGreater(int(getattr(after, "updated_at", 0) or 0), before_updated_at)

        trace = self._db_rows(
            "SELECT COUNT(*) FROM session_state_versions WHERE session_id = ? AND diagram_state_version = ?",
            (self.sid, self.base_version + 1),
        )
        self.assertEqual(trace[0][0], 1)
        applied_rows = self._db_rows("SELECT COUNT(*) FROM session_applied_ops WHERE session_id = ?", (self.sid,))
        self.assertEqual(applied_rows[0][0], 3)
        snapshots = self._db_rows(
            "SELECT COUNT(*) FROM bpmn_versions WHERE session_id = ? AND diagram_state_version = ?",
            (self.sid, self.base_version + 1),
        )
        self.assertEqual(snapshots[0][0], 1)

    def test_idempotent_replay_does_not_increment_version(self):
        body = {
            "baseVersion": self.base_version,
            "operations": [
                self._op("op-1", "element.updateProperties", elementId="Task_1", properties={"name": "New name"}),
                self._op("op-2", "shape.move", elementId="Task_1", x=300, y=200),
                self._op("op-3", "element.updateDi", elementId="Flow_1", waypoints=[[210, 130], [300, 230]]),
            ],
        }
        first = self._post(body)
        self.assertEqual(first.status_code, 200, first.text)
        xml_after_first = self._loaded_xml()
        # Повтор той же телом (те же opId, устаревший base) — replay fast path.
        second = self._post(body)
        self.assertEqual(second.status_code, 200, second.text)
        replay = second.json()
        self.assertEqual(replay.get("version"), self.base_version + 1)
        self.assertEqual(replay.get("applied"), 0)
        self.assertEqual(replay.get("skipped"), 3)
        self.assertEqual(self._loaded_xml(), xml_after_first)

    def test_partial_retry_skips_applied_ops(self):
        first = self._post({
            "baseVersion": self.base_version,
            "operations": [
                self._op("op-a", "element.updateProperties", elementId="Task_1", properties={"name": "Renamed"}),
                self._op("op-b", "shape.move", elementId="Task_2", x=500, y=300),
            ],
        })
        self.assertEqual(first.status_code, 200, first.text)
        second = self._post({
            "baseVersion": self.base_version + 1,
            "operations": [
                self._op("op-b", "shape.move", elementId="Task_2", x=500, y=300),
                self._op("op-c", "shape.resize", elementId="Task_1", width=160, height=100),
            ],
        })
        self.assertEqual(second.status_code, 200, second.text)
        body = second.json()
        self.assertEqual(body.get("version"), self.base_version + 2)
        self.assertEqual(body.get("applied"), 1)
        self.assertEqual(body.get("skipped"), 1)
        root = ET.fromstring(self._loaded_xml())
        bounds = _di_bounds(root, "Task_1")
        self.assertEqual((bounds.get("width"), bounds.get("height")), ("160", "100"))

    def test_conflict_returns_current_version_and_xml(self):
        resp = self._post({
            "baseVersion": self.base_version - 1,
            "operations": [
                self._op("op-1", "element.updateProperties", elementId="Task_1", properties={"name": "X"}),
            ],
        })
        self.assertEqual(resp.status_code, 409, resp.text)
        detail = resp.json().get("detail", {})
        self.assertEqual(detail.get("code"), "DIAGRAM_STATE_CONFLICT")
        self.assertEqual(detail.get("server_current_version"), self.base_version)
        server_xml = detail.get("server_current_xml") or ""
        self.assertTrue(server_xml.strip())
        ET.fromstring(server_xml)
        self.assertEqual(server_xml, SAMPLE_BPMN_XML)
        # Ничего не применилось.
        self.assertEqual(self._loaded_xml(), SAMPLE_BPMN_XML)

    def test_missing_base_version_returns_base_required_409(self):
        resp = self._post({
            "operations": [
                self._op("op-1", "element.updateProperties", elementId="Task_1", properties={"name": "X"}),
            ],
        })
        self.assertEqual(resp.status_code, 409, resp.text)
        detail = resp.json().get("detail", {})
        self.assertEqual(detail.get("code"), "DIAGRAM_STATE_BASE_VERSION_REQUIRED")
        self.assertEqual(detail.get("server_current_version"), self.base_version)

    def test_unknown_op_type_422_rolls_back_whole_batch(self):
        resp = self._post({
            "baseVersion": self.base_version,
            "operations": [
                self._op("op-1", "element.updateProperties", elementId="Task_1", properties={"name": "X"}),
                self._op("op-2", "shape.teleport", elementId="Task_1", x=1, y=1),
            ],
        })
        self.assertEqual(resp.status_code, 422, resp.text)
        detail = resp.json().get("detail", {})
        self.assertEqual(detail.get("code"), "OPERATION_UNSUPPORTED")
        self.assertEqual(detail.get("opId"), "op-2")
        self.assertEqual(detail.get("type"), "shape.teleport")
        self.assertTrue(detail.get("reason"))
        # Весь батч откатился: XML, версия и таблица applied_ops чисты.
        self.assertEqual(self._loaded_xml(), SAMPLE_BPMN_XML)
        self.assertEqual(int(getattr(self.st.load(self.sid, is_admin=True), "diagram_state_version", 0) or 0), self.base_version)
        rows = self._db_rows("SELECT COUNT(*) FROM session_applied_ops WHERE session_id = ?", (self.sid,))
        self.assertEqual(rows[0][0], 0)

    def test_missing_element_422_rolls_back_whole_batch(self):
        resp = self._post({
            "baseVersion": self.base_version,
            "operations": [
                self._op("op-1", "shape.move", elementId="Task_missing", x=1, y=1),
            ],
        })
        self.assertEqual(resp.status_code, 422, resp.text)
        detail = resp.json().get("detail", {})
        self.assertEqual(detail.get("code"), "OPERATION_UNSUPPORTED")
        self.assertEqual(detail.get("opId"), "op-1")
        self.assertEqual(self._loaded_xml(), SAMPLE_BPMN_XML)
        self.assertEqual(int(getattr(self.st.load(self.sid, is_admin=True), "diagram_state_version", 0) or 0), self.base_version)

    def test_lock_busy_returns_423(self):
        from types import SimpleNamespace

        with patch("app._legacy_main.acquire_session_lock", return_value=SimpleNamespace(acquired=False)):
            resp = self._post({
                "baseVersion": self.base_version,
                "operations": [
                    self._op("op-1", "element.updateProperties", elementId="Task_1", properties={"name": "X"}),
                ],
            })
        self.assertEqual(resp.status_code, 423, resp.text)
        detail = resp.json().get("detail", {})
        self.assertEqual(detail.get("code"), "SESSION_LOCK_BUSY")
        self.assertEqual(detail.get("server_current_version"), self.base_version)

    def test_concurrent_same_base_one_200_one_409(self):
        from app.save_services import ops_applier

        original_apply = ops_applier.apply_operations

        def slow_apply(xml_text, operations):
            time.sleep(0.2)
            return original_apply(xml_text, operations)

        outcomes = []
        outcomes_lock = threading.Lock()
        barrier = threading.Barrier(2)

        def worker():
            client = TestClient(__import__("app.main", fromlist=["app"]).app)
            try:
                barrier.wait(timeout=5.0)
                response = client.post(
                    f"/api/sessions/{self.sid}/operations",
                    json={
                        "baseVersion": self.base_version,
                        "operations": [
                            self._op(f"op-race-{uuid.uuid4().hex[:8]}", "element.updateProperties",
                                     elementId="Task_1", properties={"name": "Race"}),
                        ],
                    },
                    headers={"Authorization": f"Bearer {self.token}"},
                )
                with outcomes_lock:
                    outcomes.append(response.status_code)
            except Exception as exc:  # pragma: no cover - diagnostic only
                with outcomes_lock:
                    outcomes.append(f"error:{exc}")

        with patch("app.save_services.ops_applier.apply_operations", side_effect=slow_apply, autospec=True):
            t1 = threading.Thread(target=worker, daemon=True)
            t2 = threading.Thread(target=worker, daemon=True)
            t1.start()
            t2.start()
            t1.join(timeout=15.0)
            t2.join(timeout=15.0)

        self.assertEqual(sorted(outcomes), [200, 409], outcomes)
        self.assertEqual(int(getattr(self.st.load(self.sid, is_admin=True), "diagram_state_version", 0) or 0), self.base_version + 1)

    def test_source_persisted_per_op(self):
        resp = self._post({
            "baseVersion": self.base_version,
            "operations": [
                self._op("op-src-1", "element.updateProperties", elementId="Task_1",
                         properties={"name": "Agent"}, source="agent"),
                self._op("op-src-2", "element.updateProperties", elementId="Task_2",
                         properties={"name": "Replay"}, source="replay"),
                self._op("op-src-3", "element.updateProperties", elementId="Task_1",
                         properties={"name": "Default"}),
            ],
        })
        self.assertEqual(resp.status_code, 200, resp.text)
        rows = self._db_rows(
            "SELECT op_id, source FROM session_applied_ops WHERE session_id = ?", (self.sid,)
        )
        sources = {op_id: source for op_id, source in rows}
        self.assertEqual(sources.get("op-src-1"), "agent")
        self.assertEqual(sources.get("op-src-2"), "replay")
        self.assertEqual(sources.get("op-src-3"), "user")

    def test_cleanup_deletes_only_rows_older_than_30_days(self):
        resp = self._post({
            "baseVersion": self.base_version,
            "operations": [
                self._op("op-1", "element.updateProperties", elementId="Task_1", properties={"name": "New"}),
            ],
        })
        self.assertEqual(resp.status_code, 200, resp.text)
        now = int(time.time())
        old_ts = now - 31 * 24 * 3600
        # Прямая вставка «старой» строки (до retention-окна).
        path = os.environ.get("PROCESS_DB_PATH")
        con = sqlite3.connect(path)
        try:
            con.execute(
                "INSERT INTO session_applied_ops (session_id, op_id, applied_version, applied_at, source)"
                " VALUES (?, ?, ?, ?, ?)",
                (self.sid, "op-ancient", 1, old_ts, "user"),
            )
            con.commit()
        finally:
            con.close()

        from app.save_services.ops_applier import APPLIED_OPS_RETENTION_SECONDS, cleanup_applied_ops

        deleted = cleanup_applied_ops(now_ts=now, retention_seconds=APPLIED_OPS_RETENTION_SECONDS)
        self.assertEqual(deleted, 1)
        rows = self._db_rows(
            "SELECT op_id, applied_at FROM session_applied_ops WHERE session_id = ?", (self.sid,)
        )
        self.assertEqual([op_id for op_id, _ in rows], ["op-1"])
        self.assertGreaterEqual(int(rows[0][1]), now - 60)
        # Идемпотентность: повторный запуск ничего не удаляет и не падает.
        deleted_again = cleanup_applied_ops(now_ts=now, retention_seconds=APPLIED_OPS_RETENTION_SECONDS)
        self.assertEqual(deleted_again, 0)

    def test_lazy_cleanup_invoked_with_probability(self):
        from app.save_services import ops_applier

        with patch.object(ops_applier, "cleanup_applied_ops") as mock_cleanup:
            with patch("app.save_services.ops_applier.random.random", return_value=0.0):
                ops_applier.maybe_cleanup_applied_ops()
            mock_cleanup.assert_called_once()
            with patch("app.save_services.ops_applier.random.random", return_value=0.999):
                ops_applier.maybe_cleanup_applied_ops()
            self.assertEqual(mock_cleanup.call_count, 1)

    def test_shape_create_adds_semantics_and_di(self):
        resp = self._post({
            "baseVersion": self.base_version,
            "operations": [
                self._op("op-create", "shape.create", elementId="Task_new", bpmnType="bpmn:Task",
                         x=700, y=200, width=120, height=90, parentId="Process_ops", name="Created"),
            ],
        })
        self.assertEqual(resp.status_code, 200, resp.text)
        root = ET.fromstring(self._loaded_xml())
        created = _find_by_id(root, "Task_new")
        self.assertIsNotNone(created)
        self.assertEqual(created.tag, f"{BPMN_NS}task")
        self.assertEqual(created.get("name"), "Created")
        bounds = _di_bounds(root, "Task_new")
        self.assertIsNotNone(bounds)
        self.assertEqual((bounds.get("x"), bounds.get("width")), ("700", "120"))

    def test_connection_create_adds_refs_and_di_edge(self):
        resp = self._post({
            "baseVersion": self.base_version,
            "operations": [
                self._op("op-conn", "connection.create", connectionId="Flow_new", bpmnType="bpmn:SequenceFlow",
                         sourceId="Task_1", targetId="EndEvent_1", waypoints=[[360, 120], [592, 120]]),
            ],
        })
        self.assertEqual(resp.status_code, 200, resp.text)
        root = ET.fromstring(self._loaded_xml())
        flow = _find_by_id(root, "Flow_new")
        self.assertIsNotNone(flow)
        self.assertEqual(flow.get("sourceRef"), "Task_1")
        self.assertEqual(flow.get("targetRef"), "EndEvent_1")
        waypoints = _di_waypoints(root, "Flow_new")
        self.assertEqual(len(waypoints), 2)
        # bpmn-js semantics: outgoing/incoming дочерние элементы поддержаны.
        task_1 = _find_by_id(root, "Task_1")
        self.assertIn("Flow_new", [el.text for el in task_1 if el.tag == f"{BPMN_NS}outgoing"])
        end = _find_by_id(root, "EndEvent_1")
        self.assertIn("Flow_new", [el.text for el in end if el.tag == f"{BPMN_NS}incoming"])

    def test_shape_delete_removes_incident_connections(self):
        resp = self._post({
            "baseVersion": self.base_version,
            "operations": [
                self._op("op-del", "shape.delete", elementId="Task_2"),
            ],
        })
        self.assertEqual(resp.status_code, 200, resp.text)
        root = ET.fromstring(self._loaded_xml())
        self.assertIsNone(_find_by_id(root, "Task_2"))
        # Инцидентные connection удалены (семантика bpmn-js).
        self.assertIsNone(_find_by_id(root, "Flow_2"))
        self.assertIsNone(_find_by_id(root, "Flow_3"))
        self.assertIsNone(_di_bounds(root, "Task_2"))
        self.assertEqual(_di_waypoints(root, "Flow_2"), [])
        # incoming/outgoing соседей очищены.
        task_1 = _find_by_id(root, "Task_1")
        self.assertNotIn("Flow_2", [el.text for el in task_1 if el.tag == f"{BPMN_NS}outgoing"])
        end = _find_by_id(root, "EndEvent_1")
        self.assertNotIn("Flow_3", [el.text for el in end if el.tag == f"{BPMN_NS}incoming"])

    def test_connection_delete_removes_refs(self):
        resp = self._post({
            "baseVersion": self.base_version,
            "operations": [
                self._op("op-del-conn", "connection.delete", connectionId="Flow_2"),
            ],
        })
        self.assertEqual(resp.status_code, 200, resp.text)
        root = ET.fromstring(self._loaded_xml())
        self.assertIsNone(_find_by_id(root, "Flow_2"))
        self.assertEqual(_di_waypoints(root, "Flow_2"), [])
        task_1 = _find_by_id(root, "Task_1")
        self.assertNotIn("Flow_2", [el.text for el in task_1 if el.tag == f"{BPMN_NS}outgoing"])
        task_2 = _find_by_id(root, "Task_2")
        self.assertNotIn("Flow_2", [el.text for el in task_2 if el.tag == f"{BPMN_NS}incoming"])

    def test_put_bpmn_full_save_unchanged_behavior(self):
        # Regression guard: full-save endpoint still works and bumps version.
        resp = self.client.put(
            f"/api/sessions/{self.sid}/bpmn",
            json={"xml": SAMPLE_BPMN_XML.replace('name="Old name"', 'name="Full save name"'),
                  "base_diagram_state_version": self.base_version},
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json().get("diagram_state_version"), self.base_version + 1)


if __name__ == "__main__":
    unittest.main()


class SessionOperationsApiNegativePathTests(unittest.TestCase):
    """Отрицательные пути route (REVIEW MAJOR-3 / NIT-3 / NIT-4)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_redis_url = os.environ.get("REDIS_URL")
        self.old_cas_bypass = os.environ.get("FPC_E2E_CAS_BYPASS")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.pop("REDIS_URL", None)
        os.environ.pop("FPC_E2E_CAS_BYPASS", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")

        from app.auth import create_access_token, create_user
        from app.main import app
        from app.storage import get_storage

        self.client = TestClient(app)
        self.st = get_storage()
        enqueue_patch = patch.object(
            type(self.st), "_enqueue_rag_index_after_version", lambda *args, **kwargs: None
        )
        enqueue_patch.start()
        self.addCleanup(enqueue_patch.stop)
        suffix = uuid.uuid4().hex
        self.owner = create_user(f"owner_neg_{suffix}@local", "password", is_admin=True)
        self.token = create_access_token(str(self.owner["id"]))
        self.sid = self.st.create(title=f"ops-neg-{suffix}", user_id=str(self.owner["id"]))
        sess = self.st.load(self.sid, is_admin=True)
        sess.bpmn_xml = SAMPLE_BPMN_XML
        sess.diagram_state_version = 7
        self.st.save(sess)

    def tearDown(self):
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_redis_url is None:
            os.environ.pop("REDIS_URL", None)
        else:
            os.environ["REDIS_URL"] = self.old_redis_url
        if self.old_cas_bypass is not None:
            os.environ["FPC_E2E_CAS_BYPASS"] = self.old_cas_bypass
        self.tmp.cleanup()

    def _post(self, body):
        return self.client.post(
            f"/api/sessions/{self.sid}/operations",
            json=body,
            headers={"Authorization": f"Bearer {self.token}"},
        )

    def _rename_body(self, op_id="op-neg-1"):
        return {
            "baseVersion": 7,
            "operations": [
                {"opId": op_id, "type": "element.updateProperties",
                 "elementId": "Task_1", "properties": {"name": "X"}},
            ],
        }

    def test_missing_token_401(self):
        res = self.client.post(f"/api/sessions/{self.sid}/operations", json=self._rename_body())
        self.assertEqual(res.status_code, 401)

    def test_viewer_role_forbidden_403(self):
        from app.auth import create_access_token, create_user
        from app.domains.storage.org_auth import repository as org_auth_repo

        viewer = create_user(f"viewer_{uuid.uuid4().hex}@local", "password", is_admin=False)
        viewer_token = create_access_token(str(viewer["id"]))
        # Single-default-org harness auto-grants 'editor' на первом обращении —
        # фиксируем явное viewer-membership ДО вызова route.
        sess = self.st.load(self.sid, is_admin=True)
        org_id = str(getattr(sess, "org_id", "") or "").strip()
        with org_auth_repo._connect() as con:
            con.execute(
                "INSERT OR REPLACE INTO org_memberships (org_id, user_id, role, created_at)"
                " VALUES (?, ?, 'viewer', ?)",
                [org_id, str(viewer["id"]), int(time.time())],
            )
            con.commit()
        res = self.client.post(
            f"/api/sessions/{self.sid}/operations",
            json=self._rename_body(),
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        self.assertEqual(res.status_code, 403)

    def test_unknown_session_404(self):
        res = self.client.post(
            "/api/sessions/no-such-session/operations",
            json=self._rename_body(),
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json()["detail"]["code"], "SESSION_NOT_FOUND")

    def test_duplicate_op_id_in_batch_422(self):
        body = {
            "baseVersion": 7,
            "operations": [
                {"opId": "dup-1", "type": "element.updateProperties",
                 "elementId": "Task_1", "properties": {"name": "A"}},
                {"opId": "dup-1", "type": "element.updateProperties",
                 "elementId": "Task_2", "properties": {"name": "B"}},
            ],
        }
        res = self._post(body)
        self.assertEqual(res.status_code, 422)
        version_after = int(getattr(self.st.load(self.sid, is_admin=True), "diagram_state_version", 0) or 0)
        self.assertEqual(version_after, 7, "batch with duplicate opId must not be applied")

    def test_protected_id_property_rejected_422(self):
        body = {
            "baseVersion": 7,
            "operations": [
                {"opId": "op-id-1", "type": "element.updateProperties",
                 "elementId": "Task_1", "properties": {"id": "Task_Evil"}},
            ],
        }
        res = self._post(body)
        self.assertEqual(res.status_code, 422)
        self.assertIn("protected_property", res.json()["detail"]["reason"])
        xml_after = str(getattr(self.st.load(self.sid, is_admin=True), "bpmn_xml", "") or "")
        self.assertIn('id="Task_1"', xml_after)

    def test_shape_create_with_participant_parent_lands_in_process(self):
        # Wire bpmn-js createShape несёт parentId=participant: flow node внутри
        # bpmn:participant невалидна (bpmn-js дропает её при импорте) — сервер
        # обязан разместить элемент в processRef участника.
        body = {
            "baseVersion": 7,
            "operations": [
                {"opId": "op-par-1", "type": "shape.create", "elementId": "Task_created",
                 "elementType": "bpmn:Task", "parentId": "Participant_1",
                 "bounds": {"x": 900, "y": 300, "width": 100, "height": 80}},
            ],
        }
        # SAMPLE_BPMN_XML без collaboration/participant — добавляем обёртку.
        wrapped = SAMPLE_BPMN_XML.replace(
            '<bpmn:process id="Process_ops"',
            '<bpmn:collaboration id="Collaboration_1">'
            '<bpmn:participant id="Participant_1" processRef="Process_ops" /></bpmn:collaboration>'
            '<bpmn:process id="Process_ops"',
        )
        sess = self.st.load(self.sid, is_admin=True)
        sess.bpmn_xml = wrapped
        self.st.save(sess)
        res = self._post(body)
        self.assertEqual(res.status_code, 200)
        xml_after = str(getattr(self.st.load(self.sid, is_admin=True), "bpmn_xml", "") or "")
        self.assertIn('id="Task_created"', xml_after)
        participant_idx = xml_after.index('id="Participant_1"')
        task_idx = xml_after.index('id="Task_created"')
        process_idx = xml_after.index('id="Process_ops"')
        # Task создан ПОСЛЕ открывающего process, а не внутри participant
        # (participant — self-closing в обёртке: task не может быть внутри).
        self.assertGreater(task_idx, process_idx)
        self.assertGreater(participant_idx, 0)
        self.assertIn('bpmnElement="Task_created"', xml_after, "DI shape for created element")
