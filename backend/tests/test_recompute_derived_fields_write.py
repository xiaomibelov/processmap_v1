"""Б5 (fix/save-latency-subprocess-async, IMPLEMENTATION Этап 5): recompute
пишет ТОЛЬКО derived-поля (field-scoped UPDATE).

White-list колонок: normalized, resources, questions, mermaid_simple,
mermaid_lanes, mermaid, analytics, version, updated_at.
``bpmn_xml`` / ``diagram_state_version`` / ``bpmn_meta`` — ВНЕ списка: full-row
save со stale in-memory копией молчаливо откатывал чужой CAS-коммит
PUT /bpmn, прошедший во время рекомпьюта (L4).
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

SAMPLE_BPMN_XML_A = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_A" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_A" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Task A">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>
"""

SAMPLE_BPMN_XML_B = SAMPLE_BPMN_XML_A.replace("Task A", "Task B")


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}
        self.query_params = {}
        self.scope = {"type": "http"}


class RecomputeDerivedFieldsWriteTests(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)

        from app._legacy_main import (
            BpmnXmlIn,
            CreateSessionIn,
            get_storage,
            session_bpmn_save,
        )
        from app.services.session_recompute import _recompute_session
        from app.services.session_service import recompute_session
        from app.storage import get_default_org_id

        self.BpmnXmlIn = BpmnXmlIn
        self.CreateSessionIn = CreateSessionIn
        self.get_storage = get_storage
        self.session_bpmn_save = session_bpmn_save
        self._recompute_session = _recompute_session
        self.recompute_session = recompute_session
        self.default_org_id = get_default_org_id()

        created = self.CreateSessionIn(title="Recompute L4")
        from app._legacy_main import create_session

        out = create_session(created)
        self.sid = str(out.get("id") or "")
        self.assertTrue(self.sid)
        self.req = _DummyRequest(
            {"id": "recompute_admin", "email": "recompute@t.local", "is_admin": True},
            active_org_id=self.default_org_id,
        )

    def tearDown(self):
        if self.old_sessions_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_sessions_dir
        if self.old_projects_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_projects_dir
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _load_admin(self):
        return self.get_storage().load(self.sid, is_admin=True)

    def _save_bpmn_a(self):
        out = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML_A, base_diagram_state_version=0),
            self.req,
        )
        self.assertEqual(out.get("ok"), True)
        return out

    def test_update_derived_fields_never_writes_bpmn_columns(self):
        """White-list: bpmn_xml/dsv/bpmn_meta из fields игнорируются методом."""
        self._save_bpmn_a()  # dsv == 1
        st = self.get_storage()

        # Stale in-memory копия: recompute отработал, но объект «не видит»
        # чужой CAS-коммит (как было у full-row save).
        sess = st.load(self.sid, is_admin=True)
        sess.bpmn_xml = SAMPLE_BPMN_XML_B          # чужой/новый XML
        sess.diagram_state_version = 999           # чужой dsv
        sess.bpmn_meta = {"subprocesses_total": 7}  # чужие мета
        sess = self._recompute_session(sess)

        # «Злые» ключи в fields — метод ОБЯЗАН их отфильтровать (white-list
        # внутри метода, а не на call-site).
        st.update_derived_fields(  # pylint: disable=no-member
            self.sid,
            {
                "normalized": getattr(sess, "normalized", {}) or {},
                "resources": getattr(sess, "resources", {}) or {},
                "questions": getattr(sess, "questions", []) or [],
                "mermaid_simple": str(getattr(sess, "mermaid_simple", "") or ""),
                "mermaid_lanes": str(getattr(sess, "mermaid_lanes", "") or ""),
                "mermaid": str(getattr(sess, "mermaid", "") or ""),
                "analytics": getattr(sess, "analytics", {}) or {},
                "version": int(getattr(sess, "version", 0) or 0),
                "bpmn_xml": SAMPLE_BPMN_XML_B,
                "diagram_state_version": 999,
                "bpmn_meta": {"subprocesses_total": 7},
            },
        )

        reloaded = self._load_admin()
        self.assertEqual(str(reloaded.bpmn_xml or ""), SAMPLE_BPMN_XML_A)
        self.assertEqual(int(reloaded.diagram_state_version or 0), 1)
        # bpmn_xml-derivatives мета (flow_meta и т.п.) — от сохранения, не от
        # recompute; «злое» значение subprocesses_total из fields не проникло
        meta = dict(reloaded.bpmn_meta or {})
        self.assertNotIn("subprocesses_total", meta)
        # derived-поля обновлены
        self.assertIsInstance(reloaded.questions, list)
        self.assertTrue(int(getattr(reloaded, "version", 0) or 0) >= 1)

    def test_recompute_endpoint_updates_questions_and_keeps_diagram_truth(self):
        """Happy-path: POST /recompute обновляет derived, XML/dsv не трогает."""
        from app.models import Node

        st = self.get_storage()
        s = st.load(self.sid, is_admin=True)
        s.nodes = [
            Node(id="n_heat", title="Нагрев", type="step", parameters={}, equipment=[], disposition={}),
        ]
        st.save(s, is_admin=True)

        self._save_bpmn_a()  # dsv 0 -> 1 (owner остаётся пустым: admin-save)

        result = self.recompute_session(self.sid, self.req)
        self.assertNotIn("error", result)

        reloaded = self._load_admin()
        self.assertEqual(str(reloaded.bpmn_xml or ""), SAMPLE_BPMN_XML_A)
        self.assertEqual(int(reloaded.diagram_state_version or 0), 1)
        self.assertTrue(len(reloaded.questions or []) > 0)
        self.assertIn("analytics", reloaded.model_dump())

    def test_recompute_after_concurrent_bpmn_save_keeps_fresh_xml(self):
        """Concurrency: PUT /bpmn (dsv 2) до recompute → XML/dsv от PUT сохраняются."""
        self._save_bpmn_a()
        second = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML_B, base_diagram_state_version=1),
            self.req,
        )
        self.assertEqual(second.get("ok"), True)
        self.assertEqual(int(second.get("diagram_state_version") or 0), 2)

        result = self.recompute_session(self.sid, self.req)
        self.assertNotIn("error", result)

        reloaded = self._load_admin()
        self.assertEqual(str(reloaded.bpmn_xml or ""), SAMPLE_BPMN_XML_B)
        self.assertEqual(int(reloaded.diagram_state_version or 0), 2)

    def test_update_derived_fields_missing_session_raises_not_found(self):
        from app.storage import SessionNotFoundError

        st = self.get_storage()
        with self.assertRaises(SessionNotFoundError):
            st.update_derived_fields(  # pylint: disable=no-member
                "no-such-session-l4", {"version": 1}
            )

    def test_update_derived_fields_owner_scope_guard(self):
        """Guard как у save: чужой не-admin получает PermissionError."""
        self._save_bpmn_a()
        st = self.get_storage()

        with self.assertRaises(PermissionError):
            st.update_derived_fields(  # pylint: disable=no-member
                self.sid, {"version": 2}, user_id="intruder_l4", is_admin=False
            )

        # admin / владелец — ок
        st.update_derived_fields(  # pylint: disable=no-member
            self.sid, {"version": 2}, is_admin=True
        )
