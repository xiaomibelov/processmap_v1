"""Контрактный тест серверного no-op guard PUT /api/sessions/{id}/bpmn
(контур fix/canvas-apply-persist-validation).

Контекст: canvas «Применить к схеме» делает full-PUT результата apply. Когда
тот же XML уже закоммичен конкурентным писателем (autosave-каскад той же
команды выиграл гонку), сервер штатно отвечает no-op guard'ом: ok=True БЕЗ
bpmn_version_snapshot. Фронтенд обязан трактовать такой ответ как УСПЕХ
persist'а (откат apply по этому поводу — дефект; см. FIX.md контура).

Тест фиксирует форму ответа, чтобы регрессия контракта ловилась на бэкенде,
а не на приёмке stage.
"""
import os
import tempfile
import unittest

from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
import sys
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

SAMPLE_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1">
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

SAMPLE_BPMN_XML_V2 = SAMPLE_BPMN_XML.replace(
    '<bpmn:task id="Task_1">',
    '<bpmn:task id="Task_1" name="changed">',
)


class BpmnPutNoopGuardContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_redis_url = os.environ.get("REDIS_URL")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["REDIS_URL"] = "redis://test/0"

        import app._legacy_main as main_mod

        self.main_mod = main_mod
        self.BpmnXmlIn = main_mod.BpmnXmlIn
        self.CreateSessionIn = main_mod.CreateSessionIn
        created = main_mod.create_session(self.CreateSessionIn(title="noop-guard-test"))
        self.sid = str(created.get("id") or "")
        self.assertTrue(self.sid)

    def tearDown(self):
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_redis_url is None:
            os.environ.pop("REDIS_URL", None)
        else:
            os.environ["REDIS_URL"] = self.old_redis_url
        self.tmp.cleanup()

    def test_first_save_returns_bpmn_version_snapshot(self):
        out = self.main_mod.session_bpmn_save(
            self.sid, self.BpmnXmlIn(xml=SAMPLE_BPMN_XML, source_action="manual_save")
        )
        self.assertEqual(out.get("ok"), True)
        self.assertIsInstance(out.get("bpmn_version_snapshot"), dict)

    def test_noop_guard_returns_ok_without_bpmn_version_snapshot(self):
        first = self.main_mod.session_bpmn_save(
            self.sid, self.BpmnXmlIn(xml=SAMPLE_BPMN_XML, source_action="manual_save")
        )
        self.assertEqual(first.get("ok"), True)
        current_version = int(first.get("diagram_state_version") or 0)

        # Повторный PUT того же XML с base <= current → no-op guard.
        second = self.main_mod.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(
                xml=SAMPLE_BPMN_XML,
                source_action="manual_save",
                base_diagram_state_version=current_version,
            ),
        )
        self.assertEqual(second.get("ok"), True, second)
        # Контракт no-op guard: снапшот НЕ планируется (новой версии нет),
        # версия не инкрементирована.
        self.assertNotIn("bpmn_version_snapshot", second)
        self.assertEqual(int(second.get("diagram_state_version") or 0), current_version)
        self.assertEqual(second.get("changed_keys"), [])

    def test_changed_xml_still_returns_snapshot(self):
        self.main_mod.session_bpmn_save(
            self.sid, self.BpmnXmlIn(xml=SAMPLE_BPMN_XML, source_action="manual_save")
        )
        out = self.main_mod.session_bpmn_save(
            self.sid, self.BpmnXmlIn(xml=SAMPLE_BPMN_XML_V2, source_action="manual_save")
        )
        self.assertEqual(out.get("ok"), True)
        self.assertIsInstance(out.get("bpmn_version_snapshot"), dict)


if __name__ == "__main__":
    unittest.main()
