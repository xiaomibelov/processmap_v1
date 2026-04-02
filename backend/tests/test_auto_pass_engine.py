import unittest
from types import SimpleNamespace

from app.auto_pass_engine import compute_auto_pass_v1


def _mk_session(xml: str, interview=None, nodes=None):
    return SimpleNamespace(
        id="sess_auto",
        bpmn_xml=xml,
        interview=interview or {},
        nodes=nodes or [],
        bpmn_meta={},
    )


class AutoPassEngineTest(unittest.TestCase):
    def test_xor_gateway_produces_two_variants(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_1" name="Start" />
    <exclusiveGateway id="Gateway_1" name="Choose" />
    <task id="Task_A" name="A" />
    <task id="Task_B" name="B" />
    <endEvent id="End_A" name="End A" />
    <endEvent id="End_B" name="End B" />
    <sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Gateway_1" />
    <sequenceFlow id="Flow_2" sourceRef="Gateway_1" targetRef="Task_A" name="Path A" />
    <sequenceFlow id="Flow_3" sourceRef="Gateway_1" targetRef="Task_B" name="Path B" />
    <sequenceFlow id="Flow_4" sourceRef="Task_A" targetRef="End_A" />
    <sequenceFlow id="Flow_5" sourceRef="Task_B" targetRef="End_B" />
  </process>
</definitions>"""
        session = _mk_session(xml)
        out = compute_auto_pass_v1(session, max_variants=10, max_steps=100, max_visits_per_node=2)
        self.assertEqual(int(out["summary"]["total_variants"]), 2)
        self.assertEqual(str(out.get("status") or ""), "done")
        self.assertFalse(bool(out["summary"]["truncated"]))
        choices_lengths = sorted(len(v.get("choices") or []) for v in out.get("variants") or [])
        self.assertEqual(choices_lengths, [1, 1])
        for variant in (out.get("variants") or []):
            self.assertEqual(str(variant.get("status") or ""), "done")
            self.assertTrue(bool(variant.get("end_reached")))
            detail_rows = variant.get("detail_rows") or []
            self.assertGreater(len(detail_rows), 0)
            self.assertEqual(str(detail_rows[-1].get("kind") or ""), "end_event")

    def test_cycle_applies_guardrails_and_warns(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_1" />
    <task id="Task_A" name="A" />
    <exclusiveGateway id="Gateway_1" />
    <endEvent id="End_1" />
    <sequenceFlow id="F1" sourceRef="Start_1" targetRef="Task_A" />
    <sequenceFlow id="F2" sourceRef="Task_A" targetRef="Gateway_1" />
    <sequenceFlow id="F3" sourceRef="Gateway_1" targetRef="Task_A" name="loop" />
    <sequenceFlow id="F4" sourceRef="Gateway_1" targetRef="End_1" name="exit" />
  </process>
</definitions>"""
        session = _mk_session(xml)
        out = compute_auto_pass_v1(session, max_variants=10, max_steps=30, max_visits_per_node=1)
        self.assertFalse(bool(out["summary"]["truncated"]))
        self.assertEqual(str(out.get("status") or ""), "done")
        self.assertEqual(int(out["summary"]["total_variants"]), 1)
        self.assertEqual(int(out["summary"]["total_variants_done"]), 1)
        self.assertGreaterEqual(int(out["summary"]["total_variants_failed"] or 0), 1)
        variant = (out.get("variants") or [{}])[0]
        self.assertEqual(str(variant.get("end_event_id") or ""), "End_1")
        warning_codes = {str(w.get("code") or "") for w in (out.get("warnings") or []) if isinstance(w, dict)}
        self.assertIn("max_visits_reached", warning_codes)

    def test_gateway_loop_reentry_still_explores_exit_branch(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_1" />
    <exclusiveGateway id="Gateway_1" />
    <task id="Task_A" name="A" />
    <endEvent id="End_1" />
    <sequenceFlow id="F1" sourceRef="Start_1" targetRef="Gateway_1" />
    <sequenceFlow id="F2" sourceRef="Gateway_1" targetRef="Task_A" name="loop" />
    <sequenceFlow id="F3" sourceRef="Gateway_1" targetRef="End_1" name="exit" />
    <sequenceFlow id="F4" sourceRef="Task_A" targetRef="Gateway_1" />
  </process>
</definitions>"""
        session = _mk_session(xml)
        out = compute_auto_pass_v1(session, max_variants=10, max_steps=30, max_visits_per_node=2)
        self.assertEqual(str(out.get("status") or ""), "done")
        self.assertEqual(int(out["summary"]["total_variants"]), 2)
        self.assertEqual(int(out["summary"]["total_variants_done"]), 2)
        self.assertGreaterEqual(int(out["summary"]["total_variants_failed"] or 0), 1)
        variants = out.get("variants") or []
        choice_sequences = [
            [str(choice.get("label") or "") for choice in (variant.get("choices") or [])]
            for variant in variants
        ]
        self.assertIn(["exit"], choice_sequences)
        self.assertIn(["loop", "exit"], choice_sequences)
        for variant in variants:
            self.assertEqual(str(variant.get("end_event_id") or ""), "End_1")
        failed = out.get("debug_failed_variants") or []
        self.assertGreaterEqual(len(failed), 1)
        self.assertEqual(str((failed[0].get("error") or {}).get("code") or ""), "MAX_VISITS_REACHED")

    def test_message_flow_handoff_between_participants_reaches_remote_end(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <collaboration id="Collab_1">
    <participant id="Participant_A" processRef="Process_A" />
    <participant id="Participant_B" processRef="Process_B" />
    <messageFlow id="Msg_1" sourceRef="Throw_A" targetRef="Participant_B" />
  </collaboration>
  <process id="Process_A" isExecutable="false">
    <startEvent id="Start_A" />
    <task id="Task_A" />
    <intermediateThrowEvent id="Throw_A">
      <messageEventDefinition messageRef="Message_1" />
    </intermediateThrowEvent>
    <sequenceFlow id="F1" sourceRef="Start_A" targetRef="Task_A" />
    <sequenceFlow id="F2" sourceRef="Task_A" targetRef="Throw_A" />
  </process>
  <process id="Process_B" isExecutable="false">
    <startEvent id="Start_B" />
    <intermediateCatchEvent id="Catch_B">
      <messageEventDefinition messageRef="Message_1" />
    </intermediateCatchEvent>
    <endEvent id="End_B" />
    <sequenceFlow id="F3" sourceRef="Start_B" targetRef="Catch_B" />
    <sequenceFlow id="F4" sourceRef="Catch_B" targetRef="End_B" />
  </process>
  <message id="Message_1" name="Ready" />
</definitions>"""
        session = _mk_session(xml)
        out = compute_auto_pass_v1(session, max_variants=10, max_steps=40, max_visits_per_node=2)
        self.assertEqual(str(out.get("status") or ""), "done")
        self.assertEqual(int(out["summary"]["total_variants"]), 1)
        variant = (out.get("variants") or [{}])[0]
        self.assertEqual(str(variant.get("end_event_id") or ""), "End_B")
        handoff_rows = [row for row in (variant.get("detail_rows") or []) if str(row.get("kind") or "") == "message_handoff"]
        self.assertEqual(len(handoff_rows), 1)
        self.assertEqual(str(handoff_rows[0].get("target_id") or ""), "Catch_B")

    def test_signal_throw_routes_to_matching_signal_catch(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_1" />
    <intermediateThrowEvent id="Throw_1">
      <signalEventDefinition signalRef="Signal_1" />
    </intermediateThrowEvent>
    <intermediateCatchEvent id="Catch_1">
      <signalEventDefinition signalRef="Signal_1" />
    </intermediateCatchEvent>
    <endEvent id="End_1" />
    <sequenceFlow id="F1" sourceRef="Start_1" targetRef="Throw_1" />
    <sequenceFlow id="F2" sourceRef="Catch_1" targetRef="End_1" />
  </process>
  <signal id="Signal_1" name="Pulse" />
</definitions>"""
        session = _mk_session(xml)
        out = compute_auto_pass_v1(session, max_variants=10, max_steps=40, max_visits_per_node=2)
        self.assertEqual(str(out.get("status") or ""), "done")
        variant = (out.get("variants") or [{}])[0]
        self.assertEqual(str(variant.get("end_event_id") or ""), "End_1")
        handoff_rows = [row for row in (variant.get("detail_rows") or []) if str(row.get("kind") or "") == "message_handoff"]
        self.assertEqual(str((handoff_rows[0] or {}).get("handoff_kind") or ""), "signal_ref")

    def test_broken_message_contract_is_surfaced_truthfully(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <collaboration id="Collab_1">
    <participant id="Participant_A" processRef="Process_A" />
    <participant id="Participant_B" processRef="Process_B" />
    <messageFlow id="Msg_1" sourceRef="Throw_A" targetRef="Participant_B" />
  </collaboration>
  <process id="Process_A" isExecutable="false">
    <startEvent id="Start_A" />
    <intermediateThrowEvent id="Throw_A">
      <messageEventDefinition messageRef="Message_1" />
    </intermediateThrowEvent>
    <sequenceFlow id="F1" sourceRef="Start_A" targetRef="Throw_A" />
  </process>
  <process id="Process_B" isExecutable="false">
    <task id="Task_B" />
    <endEvent id="End_B" />
  </process>
  <message id="Message_1" name="Ready" />
</definitions>"""
        session = _mk_session(xml)
        out = compute_auto_pass_v1(session, max_variants=10, max_steps=40, max_visits_per_node=2)
        self.assertEqual(str(out.get("status") or ""), "failed")
        self.assertEqual(str(out.get("error_code") or ""), "NO_COMPLETE_PATH_TO_END")
        warning_codes = {str(w.get("code") or "") for w in (out.get("warnings") or []) if isinstance(w, dict)}
        self.assertIn("NO_COMPLETE_PATH_TO_END", warning_codes)

    def test_duration_sum_uses_interview_steps(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_1" name="Start" />
    <task id="Task_A" name="A" />
    <task id="Task_B" name="B" />
    <endEvent id="End_1" name="End" />
    <sequenceFlow id="F1" sourceRef="Start_1" targetRef="Task_A" />
    <sequenceFlow id="F2" sourceRef="Task_A" targetRef="Task_B" />
    <sequenceFlow id="F3" sourceRef="Task_B" targetRef="End_1" />
  </process>
</definitions>"""
        interview = {
            "steps": [
                {"id": "s1", "node_id": "Task_A", "duration_sec": 30},
                {"id": "s2", "node_id": "Task_B", "duration_sec": 45},
            ]
        }
        session = _mk_session(xml, interview=interview)
        out = compute_auto_pass_v1(session, max_variants=5, max_steps=20, max_visits_per_node=2)
        self.assertEqual(int(out["summary"]["total_variants"]), 1)
        variant = (out.get("variants") or [{}])[0]
        self.assertEqual(int(variant.get("total_duration_s") or 0), 75)
        self.assertEqual(int(variant.get("unknown_duration_count") or 0), 0)  # tasks-only

    def test_subprocess_is_atomic_task_step_with_duration(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_1" name="Start" />
    <subProcess id="Sub_1" name="Warm soup">
      <startEvent id="Sub_Start_1" name="Sub Start" />
      <task id="Task_Warming" name="warming_up_soup" />
      <endEvent id="Sub_End_1" name="Sub End" />
      <sequenceFlow id="SF_sub_1" sourceRef="Sub_Start_1" targetRef="Task_Warming" />
      <sequenceFlow id="SF_sub_2" sourceRef="Task_Warming" targetRef="Sub_End_1" />
    </subProcess>
    <task id="Task_After" name="After subprocess" />
    <endEvent id="End_1" name="End" />
    <sequenceFlow id="SF_1" sourceRef="Start_1" targetRef="Sub_1" />
    <sequenceFlow id="SF_2" sourceRef="Sub_1" targetRef="Task_After" />
    <sequenceFlow id="SF_3" sourceRef="Task_After" targetRef="End_1" />
  </process>
</definitions>"""
        interview = {
            "steps": [
                {"id": "s_sub", "node_id": "Sub_1", "duration_sec": 40},
                {"id": "s_after", "node_id": "Task_After", "duration_sec": 20},
            ]
        }
        session = _mk_session(xml, interview=interview)
        out = compute_auto_pass_v1(session, max_variants=10, max_steps=100, max_visits_per_node=2)
        self.assertEqual(int(out["summary"]["total_variants"]), 1)
        variant = (out.get("variants") or [{}])[0]
        step_node_ids = [str(step.get("node_id") or "") for step in (variant.get("task_steps") or [])]
        self.assertIn("Sub_1", step_node_ids)
        self.assertIn("Task_After", step_node_ids)
        self.assertNotIn("Task_Warming", step_node_ids)
        self.assertLess(step_node_ids.index("Sub_1"), step_node_ids.index("Task_After"))
        step_map = {str(step.get("node_id") or ""): step for step in (variant.get("task_steps") or [])}
        self.assertEqual(int(step_map["Sub_1"].get("duration_s") or 0), 40)
        self.assertEqual(str(step_map["Sub_1"].get("kind") or ""), "subprocess")
        self.assertEqual(str(step_map["Sub_1"].get("bpmn_type") or ""), "subprocess")
        self.assertEqual(int(step_map["Task_After"].get("duration_s") or 0), 20)
        self.assertEqual(int(variant.get("total_duration_s") or 0), 60)

    def test_run_failed_when_no_variant_reaches_top_level_end(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_1" />
    <task id="Task_A" name="A" />
    <sequenceFlow id="F1" sourceRef="Start_1" targetRef="Task_A" />
  </process>
</definitions>"""
        session = _mk_session(xml)
        out = compute_auto_pass_v1(session, max_variants=10, max_steps=100, max_visits_per_node=2)
        self.assertEqual(str(out.get("status") or ""), "failed")
        self.assertEqual(int(out["summary"]["total_variants"]), 0)
        self.assertEqual(str(out.get("error_code") or ""), "NO_MAIN_END_EVENT")
        self.assertEqual(str(out.get("error_message") or ""), "No top-level EndEvent found in main process")
        self.assertEqual(int(out["summary"]["total_variants_failed"] or 0), 0)

    def test_second_teleport_fails_variant(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_1" />
    <task id="Task_A" name="A" />
    <task id="Task_B" name="B" />
    <task id="Task_C" name="C" />
    <endEvent id="End_1" />
    <sequenceFlow id="F1" sourceRef="Start_1" targetRef="Task_A" />
    <sequenceFlow id="F2__teleport__one" sourceRef="Task_A" targetRef="Task_B" />
    <sequenceFlow id="F3__teleport__two" sourceRef="Task_B" targetRef="Task_C" />
    <sequenceFlow id="F4" sourceRef="Task_C" targetRef="End_1" />
  </process>
</definitions>"""
        session = _mk_session(xml)
        out = compute_auto_pass_v1(session, max_variants=10, max_steps=100, max_visits_per_node=2)
        self.assertEqual(str(out.get("status") or ""), "failed")
        self.assertEqual(int(out["summary"]["total_variants"]), 0)
        self.assertEqual(int(out["summary"]["total_variants_done"] or 0), 0)
        self.assertEqual(str(out.get("error_code") or ""), "NO_COMPLETE_PATH_TO_END")

    def test_only_subprocess_end_is_not_main_end(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_1" />
    <subProcess id="Sub_1">
      <startEvent id="Sub_Start_1" />
      <task id="Task_A" name="A" />
      <endEvent id="Sub_End_1" />
      <sequenceFlow id="S1" sourceRef="Sub_Start_1" targetRef="Task_A" />
      <sequenceFlow id="S2" sourceRef="Task_A" targetRef="Sub_End_1" />
    </subProcess>
    <sequenceFlow id="F1" sourceRef="Start_1" targetRef="Sub_1" />
  </process>
</definitions>"""
        session = _mk_session(xml)
        out = compute_auto_pass_v1(session, max_variants=10, max_steps=100, max_visits_per_node=2)
        self.assertEqual(str(out.get("status") or ""), "failed")
        self.assertEqual(str(out.get("error_code") or ""), "NO_MAIN_END_EVENT")

    def test_subprocess_without_outgoing_marks_variant_failed(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_1" />
    <exclusiveGateway id="Gateway_1" />
    <subProcess id="Sub_1" name="Warm soup">
      <startEvent id="Sub_Start_1" />
      <task id="Task_Warming" name="warming_up_soup" />
      <endEvent id="Sub_End_1" />
      <sequenceFlow id="SF_sub_1" sourceRef="Sub_Start_1" targetRef="Task_Warming" />
      <sequenceFlow id="SF_sub_2" sourceRef="Task_Warming" targetRef="Sub_End_1" />
    </subProcess>
    <task id="Task_OK" name="OK" />
    <endEvent id="End_1" />
    <sequenceFlow id="F1" sourceRef="Start_1" targetRef="Gateway_1" />
    <sequenceFlow id="F2" sourceRef="Gateway_1" targetRef="Sub_1" name="sub" />
    <sequenceFlow id="F3" sourceRef="Gateway_1" targetRef="Task_OK" name="ok" />
    <sequenceFlow id="F4" sourceRef="Task_OK" targetRef="End_1" />
  </process>
</definitions>"""
        session = _mk_session(xml)
        out = compute_auto_pass_v1(session, max_variants=10, max_steps=100, max_visits_per_node=2)
        self.assertEqual(str(out.get("status") or ""), "done")
        self.assertEqual(int(out["summary"]["total_variants"]), 1)
        self.assertGreaterEqual(int(out["summary"]["total_variants_failed"] or 0), 1)
        failed = out.get("debug_failed_variants") or []
        self.assertGreaterEqual(len(failed), 1)
        self.assertEqual(str((failed[0].get("error") or {}).get("code") or ""), "NO_OUTGOING_FROM_SUBPROCESS")

    def test_call_activity_is_atomic_subprocess_task(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_1" />
    <callActivity id="Call_1" name="Call child process" />
    <endEvent id="End_1" />
    <sequenceFlow id="F1" sourceRef="Start_1" targetRef="Call_1" />
    <sequenceFlow id="F2" sourceRef="Call_1" targetRef="End_1" />
  </process>
</definitions>"""
        interview = {"steps": [{"id": "s_call", "node_id": "Call_1", "duration_sec": 15}]}
        session = _mk_session(xml, interview=interview)
        out = compute_auto_pass_v1(session, max_variants=10, max_steps=100, max_visits_per_node=2)
        self.assertEqual(str(out.get("status") or ""), "done")
        self.assertEqual(int(out["summary"]["total_variants"]), 1)
        variant = (out.get("variants") or [{}])[0]
        self.assertEqual(int(variant.get("total_steps") or 0), 1)
        self.assertEqual(int(variant.get("total_duration_s") or 0), 15)
        step = (variant.get("task_steps") or [{}])[0]
        self.assertEqual(str(step.get("node_id") or ""), "Call_1")
        self.assertEqual(str(step.get("kind") or ""), "subprocess")
        self.assertEqual(str(step.get("bpmn_type") or ""), "callactivity")

    def test_gateway_dead_end_branch_not_returned_as_done_variant(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_1" />
    <exclusiveGateway id="Gateway_1" />
    <task id="Task_OK" name="OK" />
    <task id="Task_Dead" name="Dead End" />
    <endEvent id="End_1" />
    <sequenceFlow id="F1" sourceRef="Start_1" targetRef="Gateway_1" />
    <sequenceFlow id="F2" sourceRef="Gateway_1" targetRef="Task_OK" name="yes" />
    <sequenceFlow id="F3" sourceRef="Gateway_1" targetRef="Task_Dead" name="no" />
    <sequenceFlow id="F4" sourceRef="Task_OK" targetRef="End_1" />
  </process>
</definitions>"""
        session = _mk_session(xml)
        out = compute_auto_pass_v1(session, max_variants=10, max_steps=100, max_visits_per_node=2)
        self.assertEqual(str(out.get("status") or ""), "done")
        self.assertEqual(int(out["summary"]["total_variants"]), 1)
        self.assertEqual(int(out["summary"]["total_variants_done"]), 1)
        self.assertEqual(int(out["summary"]["total_variants_failed"]), 1)
        variants = out.get("variants") or []
        self.assertEqual(len(variants), 1)
        variant = variants[0]
        self.assertEqual(str(variant.get("status") or ""), "done")
        self.assertEqual(str(variant.get("end_event_id") or ""), "End_1")
        self.assertEqual(str((variant.get("detail_rows") or [{}])[-1].get("kind") or ""), "end_event")


if __name__ == "__main__":
    unittest.main()
