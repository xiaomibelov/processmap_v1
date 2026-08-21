import unittest

from app.rtiers import infer_rtiers


XOR_SUCCESS_FAIL_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="Start_1">
      <bpmn:outgoing>Flow_start_gate</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:exclusiveGateway id="Gateway_1" default="Flow_yes">
      <bpmn:incoming>Flow_start_gate</bpmn:incoming>
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
    <bpmn:endEvent id="End_success">
      <bpmn:incoming>Flow_yes_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="End_fail" name="Escalation fail">
      <bpmn:incoming>Flow_no_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_start_gate" sourceRef="Start_1" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_yes" sourceRef="Gateway_1" targetRef="Task_yes" />
    <bpmn:sequenceFlow id="Flow_no" sourceRef="Gateway_1" targetRef="Task_no" />
    <bpmn:sequenceFlow id="Flow_yes_end" sourceRef="Task_yes" targetRef="End_success" />
    <bpmn:sequenceFlow id="Flow_no_end" sourceRef="Task_no" targetRef="End_fail" />
  </bpmn:process>
</bpmn:definitions>
"""


XOR_TIE_DEFAULT_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_2" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_2" isExecutable="false">
    <bpmn:startEvent id="Start_1">
      <bpmn:outgoing>Flow_start_gate</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:exclusiveGateway id="Gateway_1" default="Flow_b">
      <bpmn:incoming>Flow_start_gate</bpmn:incoming>
      <bpmn:outgoing>Flow_a</bpmn:outgoing>
      <bpmn:outgoing>Flow_b</bpmn:outgoing>
      <bpmn:outgoing>Flow_c</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:task id="Task_a">
      <bpmn:incoming>Flow_a</bpmn:incoming>
      <bpmn:outgoing>Flow_a_end</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_b">
      <bpmn:incoming>Flow_b</bpmn:incoming>
      <bpmn:outgoing>Flow_b_end</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_c">
      <bpmn:incoming>Flow_c</bpmn:incoming>
      <bpmn:outgoing>Flow_c_end</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="End_success">
      <bpmn:incoming>Flow_a_end</bpmn:incoming>
      <bpmn:incoming>Flow_b_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="End_fail" name="Fail stop">
      <bpmn:incoming>Flow_c_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_start_gate" sourceRef="Start_1" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_a" sourceRef="Gateway_1" targetRef="Task_a" />
    <bpmn:sequenceFlow id="Flow_b" sourceRef="Gateway_1" targetRef="Task_b" />
    <bpmn:sequenceFlow id="Flow_c" sourceRef="Gateway_1" targetRef="Task_c" />
    <bpmn:sequenceFlow id="Flow_a_end" sourceRef="Task_a" targetRef="End_success" />
    <bpmn:sequenceFlow id="Flow_b_end" sourceRef="Task_b" targetRef="End_success" />
    <bpmn:sequenceFlow id="Flow_c_end" sourceRef="Task_c" targetRef="End_fail" />
  </bpmn:process>
</bpmn:definitions>
"""


class RTierInferenceTests(unittest.TestCase):
    def test_xor_success_fail_assignment(self):
        inferred = infer_rtiers(
            {
                "bpmnXml": XOR_SUCCESS_FAIL_XML,
                "scopeStartId": "Start_1",
                "successEndIds": ["End_success"],
                "failEndIds": ["End_fail"],
            }
        )
        self.assertEqual(inferred.get("Flow_yes", {}).get("rtier"), "R0")
        self.assertEqual(inferred.get("Flow_no", {}).get("rtier"), "R2")

    def test_xor_tie_uses_default_then_r1(self):
        inferred = infer_rtiers(
            {
                "bpmnXml": XOR_TIE_DEFAULT_XML,
                "scopeStartId": "Start_1",
                "successEndIds": ["End_success"],
                "failEndIds": ["End_fail"],
            }
        )
        self.assertEqual(inferred.get("Flow_b", {}).get("rtier"), "R0")
        self.assertEqual(inferred.get("Flow_a", {}).get("rtier"), "R1")
        self.assertEqual(inferred.get("Flow_c", {}).get("rtier"), "R2")

    def test_inference_is_deterministic(self):
        first = infer_rtiers(
            {
                "bpmnXml": XOR_TIE_DEFAULT_XML,
                "scopeStartId": "Start_1",
                "successEndIds": ["End_success"],
                "failEndIds": ["End_fail"],
            }
        )
        second = infer_rtiers(
            {
                "bpmnXml": XOR_TIE_DEFAULT_XML,
                "scopeStartId": "Start_1",
                "successEndIds": ["End_success"],
                "failEndIds": ["End_fail"],
            }
        )
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
