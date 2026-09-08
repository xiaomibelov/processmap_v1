"""Контур perf/bpmn-meta-parse-cache-v1 (TDD).

Файл отдельный от test_bpmn_meta.py: там module-level skip_if_hanging,
эти тесты не зависят от Celery-брокера (CELERY_TASK_ALWAYS_EAGER=1 в conftest).
"""
from __future__ import annotations

import os
import tempfile
import unittest

from unittest.mock import patch

import pytest

pytestmark = pytest.mark.skip_if_hanging


XOR_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>""
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_start_gateway</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:exclusiveGateway id="Gateway_1" default="Flow_no">
      <bpmn:incoming>Flow_start_gateway</bpmn:incoming>
      <bpmn:outgoing>Flow_yes</bpmn:outgoing>
      <bpmn:outgoing>Flow_no</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:task id="Task_yes">
      <bpmn:incoming>Flow_yes</bpmn:incoming>
      <bpmn:outgoing>Flow_yes_end</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_no">
      <bpmn:incoming>Flow_no</bpmn:incoming>
      <bpmn:outgoing>Flow_no_end</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="End_1">
      <bpmn:incoming>Flow_yes_end</bpmn:incoming>
      <bpmn:incoming>Flow_no_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_start_gateway" sourceRef="StartEvent_1" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_yes" sourceRef="Gateway_1" targetRef="Task_yes" />
    <bpmn:sequenceFlow id="Flow_no" sourceRef="Gateway_1" targetRef="Task_no" />
    <bpmn:sequenceFlow id="Flow_yes_end" sourceRef="Task_yes" targetRef="End_1" />
    <bpmn:sequenceFlow id="Flow_no_end" sourceRef="Task_no" targetRef="End_1" />
  </bpmn:process>
</bpmn:definitions>
"""


CAMUNDA_PROP_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_cam" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_cam" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="duration_min" value="10" />
        </camunda:properties>
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_1</bpmn:incoming>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
  </bpmn:process>
</bpmn:definitions>
"""


class BpmnMetaParseCacheTests(unittest.TestCase):
    """Контур perf/bpmn-meta-parse-cache-v1: PATCH/PUT bpmn_meta используют
    get_bpmn_xml_derivatives (LRU по sha1 XML) вместо сырого повторного парсинга."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        from app._legacy_main import (
            BpmnXmlIn,
            CreateSessionIn,
            UpdateSessionIn,
            create_session,
            patch_session,
            put_session,
            session_bpmn_save,
        )

        self.BpmnXmlIn = BpmnXmlIn
        self.CreateSessionIn = CreateSessionIn
        self.UpdateSessionIn = UpdateSessionIn
        self.create_session = create_session
        self.patch_session = patch_session
        self.put_session = put_session
        self.session_bpmn_save = session_bpmn_save

        created = self.create_session(CreateSessionIn(title="parse-cache test"))
        self.sid = str(created.get("id") or "")
        self.assertTrue(self.sid)
        self.assertEqual(self.session_bpmn_save(self.sid, self.BpmnXmlIn(xml=XOR_BPMN_XML)).get("ok"), True)

    def tearDown(self):
        self.tmp.cleanup()

    def _load_meta(self):
        from app._legacy_main import get_storage

        sess = get_storage().load(self.sid, is_admin=True)
        self.assertIsNotNone(sess)
        return dict(getattr(sess, "bpmn_meta", {}) or {})

    def test_patch_bpmn_meta_uses_cached_derivatives_no_reparse(self):
        from unittest.mock import patch

        import app._legacy_main as lm

        with patch.object(lm, "_collect_sequence_flow_meta", wraps=lm._collect_sequence_flow_meta) as spy_collect, \
             patch.object(lm, "extract_camunda_extensions_from_bpmn_xml", wraps=lm.extract_camunda_extensions_from_bpmn_xml) as spy_ext:
            self.patch_session(
                self.sid,
                self.UpdateSessionIn(bpmn_meta={"viewport": {"zoom": 2}}),
            )
            self.patch_session(
                self.sid,
                self.UpdateSessionIn(bpmn_meta={"viewport": {"zoom": 2.5}}),
            )

        self.assertEqual(spy_collect.call_count, 0, "PATCH bpmn_meta не должен перепарсивать XML вручную")
        self.assertEqual(spy_ext.call_count, 0, "camunda extensions должны приходить из кэшированных производных")

    def test_patch_bpmn_meta_prunes_orphan_flow_meta_via_cache(self):
        self.patch_session(
            self.sid,
            self.UpdateSessionIn(bpmn_meta={"flow_meta": {"Flow_no_such": {"tier": "P0"}}}),
        )
        meta = self._load_meta()
        self.assertNotIn("Flow_no_such", meta.get("flow_meta", {}))

    def test_patch_bpmn_meta_populates_camunda_extensions_from_derivatives(self):
        self.assertEqual(self.session_bpmn_save(self.sid, self.BpmnXmlIn(xml=CAMUNDA_PROP_BPMN_XML)).get("ok"), True)
        self.patch_session(
            self.sid,
            self.UpdateSessionIn(bpmn_meta={"viewport": {"zoom": 1}}),
        )
        meta = self._load_meta()
        ext = meta.get("camunda_extensions_by_element_id") or {}
        self.assertIn("Task_1", ext)

    def test_put_session_uses_cached_derivatives_no_reparse(self):
        from unittest.mock import patch

        import app._legacy_main as lm

        with patch.object(lm, "_collect_sequence_flow_meta", wraps=lm._collect_sequence_flow_meta) as spy_collect:
            self.put_session(
                self.sid,
                self.UpdateSessionIn(
                    title="parse-cache test",
                    roles=["cook_1"],
                    nodes=[],
                    edges=[],
                    questions=[],
                    notes=[],
                ),
            )

        self.assertEqual(spy_collect.call_count, 0, "PUT не должен перепарсивать неизменный XML вручную")
