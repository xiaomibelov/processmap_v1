import os
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from pathlib import Path
import sys

from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
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


class _FakeRedis:
    def __init__(self):
        self._values = {}
        self._lock = threading.Lock()

    def set(self, key, value, nx=False, px=None):
        _ = px
        with self._lock:
            if nx and key in self._values:
                return False
            self._values[key] = value
            return True

    def eval(self, script, numkeys, key, token):
        _ = script
        _ = numkeys
        with self._lock:
            if self._values.get(key) == token:
                self._values.pop(key, None)
                return 1
            return 0


class BpmnPutRedisLockIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_redis_url = os.environ.get("REDIS_URL")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ["REDIS_URL"] = "redis://test/0"

        import app.main as main_mod

        self.main_mod = main_mod
        self.BpmnXmlIn = main_mod.BpmnXmlIn
        self.CreateSessionIn = main_mod.CreateSessionIn
        self.create_session = main_mod.create_session
        self.session_bpmn_save = main_mod.session_bpmn_save
        created = self.create_session(self.CreateSessionIn(title="lock-test"))
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

    def test_parallel_put_one_succeeds_one_gets_locked(self):
        fake = _FakeRedis()
        barrier = threading.Barrier(2)
        outcomes = []
        outcomes_lock = threading.Lock()
        original_collect = self.main_mod._collect_sequence_flow_meta

        def slow_collect(xml_text):
            time.sleep(0.25)
            return original_collect(xml_text)

        def worker():
            try:
                barrier.wait(timeout=3.0)
                result = self.session_bpmn_save(self.sid, self.BpmnXmlIn(xml=SAMPLE_BPMN_XML))
                with outcomes_lock:
                    outcomes.append(("ok", result))
            except Exception as exc:
                with outcomes_lock:
                    outcomes.append(("err", exc))

        with patch("app.redis_lock.get_client", return_value=fake), patch(
            "app.main._collect_sequence_flow_meta",
            side_effect=slow_collect,
        ):
            t1 = threading.Thread(target=worker, daemon=True)
            t2 = threading.Thread(target=worker, daemon=True)
            t1.start()
            t2.start()
            t1.join(timeout=5.0)
            t2.join(timeout=5.0)

        self.assertEqual(len(outcomes), 2, outcomes)
        ok_rows = [payload for kind, payload in outcomes if kind == "ok" and isinstance(payload, dict) and payload.get("ok")]
        lock_rows = [
            err for kind, err in outcomes
            if kind == "err" and isinstance(err, HTTPException) and int(getattr(err, "status_code", 0) or 0) in (409, 423)
        ]
        self.assertEqual(len(ok_rows), 1, outcomes)
        self.assertEqual(len(lock_rows), 1, outcomes)


if __name__ == "__main__":
    unittest.main()
