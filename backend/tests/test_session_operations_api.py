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

    def test_conflict_includes_server_xml_for_non_default_org(self):
        """fix/async-save-409-rebase: сессия в org != _default_org_id().

        409 обязан содержать server_current_xml и здесь. Репродукция условия
        stage (async-save:625 «other-client edit survived rebase»): helper
        конфликта делал storage.load(is_admin=True) без org → скоупинг на
        дефолтный org → None → поле терялось → фронт деградировал в
        full-save и затирал чужие правки. На stage org-ContextVar пуст в
        threadpool-контексте sync-endpoint'а — эмулируем патчем middleware
        (org НЕ прокидывается в storage scope), при этом endpoint сам сессию
        находит по X-Org-Id кандидатам.
        """
        from app.auth import create_access_token, create_user
        import app.startup.middleware as auth_middleware

        real_push = auth_middleware.push_storage_request_scope

        def push_without_org(user_id, is_admin=False, org_id=None):
            # Эмуляция stage: org не доезжает до storage-request-scope.
            return real_push(user_id, is_admin, "")

        suffix = uuid.uuid4().hex
        other_org = f"org_nondefault_{suffix}"
        owner2 = create_user(f"owner2_{suffix}@local", "password", is_admin=True)
        token2 = create_access_token(str(owner2["id"]))
        sid2 = self.st.create(title=f"ops-org-{suffix}", user_id=str(owner2["id"]), org_id=other_org)
        sess2 = self.st.load(sid2, is_admin=True, org_id=other_org)
        sess2.bpmn_xml = SAMPLE_BPMN_XML
        sess2.diagram_state_version = 7
        self.st.save(sess2)

        with patch.object(auth_middleware, "push_storage_request_scope", push_without_org):
            resp = self.client.post(
                f"/api/sessions/{sid2}/operations",
                json={
                    "baseVersion": 6,
                    "operations": [
                        self._op("op-org-1", "element.updateProperties", elementId="Task_1", properties={"name": "X"}),
                    ],
                },
                headers={"Authorization": f"Bearer {token2}", "X-Org-Id": other_org},
            )
        self.assertEqual(resp.status_code, 409, resp.text)
        detail = resp.json().get("detail", {})
        self.assertEqual(detail.get("code"), "DIAGRAM_STATE_CONFLICT")
        server_xml = detail.get("server_current_xml") or ""
        self.assertTrue(server_xml.strip(), "409 must include server_current_xml for non-default org")
        self.assertEqual(server_xml, SAMPLE_BPMN_XML)

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


PARENT_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Definitions_parent" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_parent" isExecutable="false">
    <bpmn:subProcess id="Sub_1" name="Child fragment">
      <bpmn:task id="ChildTask_old" name="Stale child task" />
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_parent">
    <bpmndi:BPMNPlane id="BPMNPlane_parent" bpmnElement="Process_parent">
      <bpmndi:BPMNShape id="Sub_1_di" bpmnElement="Sub_1">
        <dc:Bounds x="200" y="80" width="400" height="250" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


class SessionOperationsStep2InheritanceTests(unittest.TestCase):
    """Наследие step1 (API.md §5): один live-route, parent re-embed ordering,
    org-explicit conflict reload в _save_session_with_cas, client-generated id
    для create-ops."""

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
        self.owner = create_user(f"owner_s2_{suffix}@local", "password", is_admin=True)
        self.token = create_access_token(str(self.owner["id"]))
        self.sid = self.st.create(title=f"ops-s2-{suffix}", user_id=str(self.owner["id"]))
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

    def _post(self, session_id, body):
        return self.client.post(
            f"/api/sessions/{session_id}/operations",
            json=body,
            headers={"Authorization": f"Bearer {self.token}"},
        )

    def _parent_xml(self, parent_id: str) -> str:
        return str(getattr(self.st.load(parent_id, is_admin=True), "bpmn_xml", "") or "")

    def _make_child_with_parent(self):
        """Родитель с subProcess Sub_1 + дочерняя сессия, привязанная к нему."""
        suffix = uuid.uuid4().hex[:8]
        parent_id = self.st.create(title=f"ops-parent-{suffix}", user_id=str(self.owner["id"]))
        parent = self.st.load(parent_id, is_admin=True)
        parent.bpmn_xml = PARENT_BPMN_XML
        parent.diagram_state_version = 3
        self.st.save(parent)

        child_id = self.st.create(title=f"ops-child-{suffix}", user_id=str(self.owner["id"]))
        child = self.st.load(child_id, is_admin=True)
        child.bpmn_xml = SAMPLE_BPMN_XML
        child.diagram_state_version = 7
        child.parent_session_id = parent_id
        child.element_id_in_parent = "Sub_1"
        self.st.save(child)
        return parent_id, child_id

    # --- route introspection (наследие п.4) ----------------------------

    def test_exactly_one_live_operations_route_registration(self):
        import app._legacy_main as legacy

        def operations_post_routes(app_obj):
            return [
                route
                for route in app_obj.routes
                if "POST" in (getattr(route, "methods", None) or set())
                and getattr(route, "path", "") == "/api/sessions/{session_id}/operations"
            ]

        live_matches = operations_post_routes(__import__("app.main", fromlist=["app"]).app)
        self.assertEqual(len(live_matches), 1, "live app must have exactly one POST /operations route")
        self.assertEqual(
            live_matches[0].endpoint.__module__,
            "app.routers.sessions",
            "live route must be served by routers/sessions.py",
        )
        legacy_matches = operations_post_routes(legacy.app)
        self.assertEqual(
            len(legacy_matches),
            0,
            "legacy @app.post duplicate must be removed (handler function stays for session_service)",
        )

    # --- parent re-embed ordering (наследие п.2) -----------------------

    def test_parent_reembed_happy_path_syncs_after_child_commit(self):
        parent_id, child_id = self._make_child_with_parent()
        resp = self._post(child_id, {
            "baseVersion": 7,
            "operations": [
                {"opId": "p-happy-1", "type": "element.updateProperties",
                 "elementId": "Task_1", "properties": {"name": "Parent synced"}},
            ],
        })
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json().get("parent_synced"), True)
        parent_xml = self._parent_xml(parent_id)
        self.assertIn('name="Parent synced"', parent_xml)
        self.assertIn('id="Task_1"', parent_xml)

    def test_parent_not_touched_when_child_commit_conflicts(self):
        """Transient divergence: CAS-409 child → parent XML НЕ перезаписан
        (re-embed обязан идти ПОСЛЕ SQL-CAS commit)."""
        import app._legacy_main as legacy

        parent_id, child_id = self._make_child_with_parent()
        parent_xml_before = self._parent_xml(parent_id)
        with patch.object(legacy, "_require_diagram_cas_or_409", lambda **kwargs: None):
            resp = self._post(child_id, {
                "baseVersion": 6,  # stale — pre-check замьючен, падает только SQL-CAS
                "operations": [
                    {"opId": "p-conflict-1", "type": "element.updateProperties",
                     "elementId": "Task_1", "properties": {"name": "Must not reach parent"}},
                ],
            })
        self.assertEqual(resp.status_code, 409, resp.text)
        self.assertEqual(
            self._parent_xml(parent_id),
            parent_xml_before,
            "parent XML must stay untouched when child commit rolls back (409)",
        )

    def test_parent_reembed_failure_keeps_child_commit_and_reports_parent_synced_false(self):
        from app.services import bpmn_navigation

        parent_id, child_id = self._make_child_with_parent()
        real_reembed = bpmn_navigation.re_embed_child_xml_into_parent
        with patch.object(
            bpmn_navigation, "re_embed_child_xml_into_parent", side_effect=RuntimeError("parent storage down")
        ) as mock_reembed:
            resp = self._post(child_id, {
                "baseVersion": 7,
                "operations": [
                    {"opId": "p-fail-1", "type": "element.updateProperties",
                     "elementId": "Task_1", "properties": {"name": "Child committed anyway"}},
                ],
            })
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json().get("parent_synced"), False)
        # Child-коммит не откатился: правка в durable storage.
        child_xml = str(getattr(self.st.load(child_id, is_admin=True), "bpmn_xml", "") or "")
        self.assertIn('name="Child committed anyway"', child_xml)
        # Retry-семантика: изолированные попытки не долетели до родителя.
        self.assertGreaterEqual(mock_reembed.call_count, 1)
        self.assertIn("Stale child task", self._parent_xml(parent_id))

    def test_parent_reembed_retries_then_succeeds(self):
        from app.services import bpmn_navigation

        parent_id, child_id = self._make_child_with_parent()
        real_reembed = bpmn_navigation.re_embed_child_xml_into_parent
        attempts = []

        def flaky_reembed(*args, **kwargs):
            attempts.append(1)
            if len(attempts) < 3:
                raise RuntimeError(f"attempt {len(attempts)}")
            return real_reembed(*args, **kwargs)

        with patch.object(
            bpmn_navigation,
            "re_embed_child_xml_into_parent",
            side_effect=flaky_reembed,
        ) as mock_reembed, patch("app._legacy_main.time.sleep", lambda *args, **kwargs: None):
            resp = self._post(child_id, {
                "baseVersion": 7,
                "operations": [
                    {"opId": "p-retry-1", "type": "element.updateProperties",
                     "elementId": "Task_1", "properties": {"name": "Retry won"}},
                ],
            })
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(mock_reembed.call_count, 3, "re-embed must be retried up to 3 attempts")
        self.assertEqual(resp.json().get("parent_synced"), True)
        self.assertIn('name="Retry won"', self._parent_xml(parent_id))

    # --- org-explicit conflict reload в _save_session_with_cas (#989) ---

    def test_save_session_with_cas_conflict_reload_uses_explicit_org(self):
        """Паттерн #989: reload в helper'е без org_id молча падал в default org,
        сессия в другой org не находилась и 409 payload строился по клиентскому
        (неподтверждённому) объекту — server_last_write показывал автора-лузера."""
        from fastapi import HTTPException

        from app.auth import create_user
        from app.utils.session_helpers import _mark_diagram_truth_write, _save_session_with_cas

        other_org = f"org_cas_{uuid.uuid4().hex}"
        writer_a = create_user(f"writer_a_{uuid.uuid4().hex}@local", "password", is_admin=True)
        sid2 = self.st.create(
            title=f"ops-cas-{uuid.uuid4().hex}", user_id=str(writer_a["id"]), org_id=other_org
        )
        # Серверный коммит актора A (версия 7 → 8 после truth-write+save).
        server_sess = self.st.load(sid2, is_admin=True, org_id=other_org)
        server_sess.bpmn_xml = SAMPLE_BPMN_XML
        server_sess.diagram_state_version = 7
        _mark_diagram_truth_write(
            server_sess,
            changed_keys=["bpmn_xml"],
            actor_user_id=str(writer_a["id"]),
            actor_label="Writer A",
            client_id="client-A",
        )
        self.st.save(server_sess, user_id=str(writer_a["id"]), org_id=other_org, is_admin=True)

        # Клиент B: свежая загрузка, in-memory мутация (как handler до CAS), stale base.
        client_sess = self.st.load(sid2, is_admin=True, org_id=other_org)
        client_sess.bpmn_xml = SAMPLE_BPMN_XML.replace('name="Old name"', 'name="Client B edit"')
        _mark_diagram_truth_write(
            client_sess,
            changed_keys=["bpmn_xml"],
            actor_user_id="user-b",
            actor_label="Writer B",
            client_id="client-B",
        )
        with self.assertRaises(HTTPException) as ctx:
            _save_session_with_cas(
                self.st,
                client_sess,
                client_base_version=6,
                user_id="user-b",
                org_id=other_org,
                is_admin=True,
            )
        self.assertEqual(ctx.exception.status_code, 409)
        detail = ctx.exception.detail
        self.assertEqual(detail.get("code"), "DIAGRAM_STATE_CONFLICT")
        self.assertEqual(detail.get("server_current_version"), 8)
        last_write = detail.get("server_last_write") or {}
        self.assertEqual(
            last_write.get("actor_user_id"),
            str(writer_a["id"]),
            "409 server_last_write must describe the actual last server writer, not the losing client",
        )
        self.assertEqual(last_write.get("client_id"), "client-A")
        # Клиентский неподтверждённый коммит не должен был уйти в storage.
        reloaded = self.st.load(sid2, is_admin=True, org_id=other_org)
        self.assertEqual(int(getattr(reloaded, "diagram_state_version", 0) or 0), 8)
        self.assertIn('name="Old name"', str(getattr(reloaded, "bpmn_xml", "") or ""))

    # --- create-op с клиентским id (наследие п.6) -----------------------

    def test_shape_create_with_client_generated_id_replay_safe(self):
        body = {
            "baseVersion": 7,
            "operations": [
                {"opId": "op-cid-1", "type": "shape.create", "id": "Task_client",
                 "bpmnType": "bpmn:Task", "x": 700, "y": 200, "width": 100, "height": 80,
                 "parentId": "Process_ops"},
            ],
        }
        resp = self._post(self.sid, body)
        self.assertEqual(resp.status_code, 200, resp.text)
        xml_after = str(getattr(self.st.load(self.sid, is_admin=True), "bpmn_xml", "") or "")
        self.assertEqual(xml_after.count('id="Task_client"'), 1)

        # Replay того же батча (те же opId) — идемпотентно, без коллизии id.
        replay = self._post(self.sid, body)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json().get("applied"), 0)
        self.assertEqual(replay.json().get("skipped"), 1)
        xml_replay = str(getattr(self.st.load(self.sid, is_admin=True), "bpmn_xml", "") or "")
        self.assertEqual(xml_replay.count('id="Task_client"'), 1)

    def test_shape_create_client_id_collision_422(self):
        first = self._post(self.sid, {
            "baseVersion": 7,
            "operations": [
                {"opId": "op-col-1", "type": "shape.create", "id": "Task_dup",
                 "bpmnType": "bpmn:Task", "x": 700, "y": 200, "width": 100, "height": 80,
                 "parentId": "Process_ops"},
            ],
        })
        self.assertEqual(first.status_code, 200, first.text)
        second = self._post(self.sid, {
            "baseVersion": 8,
            "operations": [
                {"opId": "op-col-2", "type": "shape.create", "id": "Task_dup",
                 "bpmnType": "bpmn:Task", "x": 900, "y": 300, "width": 100, "height": 80,
                 "parentId": "Process_ops"},
            ],
        })
        self.assertEqual(second.status_code, 422, second.text)
        self.assertIn("already_exists", str(second.json().get("detail", {}).get("reason", "")))
        xml_after = str(getattr(self.st.load(self.sid, is_admin=True), "bpmn_xml", "") or "")
        self.assertEqual(xml_after.count('id="Task_dup"'), 1)

    def test_connection_create_with_client_generated_id(self):
        resp = self._post(self.sid, {
            "baseVersion": 7,
            "operations": [
                {"opId": "op-ccid-1", "type": "connection.create", "id": "Flow_client",
                 "bpmnType": "bpmn:SequenceFlow", "sourceId": "Task_1", "targetId": "EndEvent_1",
                 "waypoints": [[360, 120], [592, 120]]},
            ],
        })
        self.assertEqual(resp.status_code, 200, resp.text)
        root = ET.fromstring(str(getattr(self.st.load(self.sid, is_admin=True), "bpmn_xml", "") or ""))
        flow = _find_by_id(root, "Flow_client")
        self.assertIsNotNone(flow)
        self.assertEqual(flow.get("sourceRef"), "Task_1")
        self.assertEqual(flow.get("targetRef"), "EndEvent_1")


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
