from __future__ import annotations

import xml.etree.ElementTree as ET

from app.services.bpmn_navigation import (
    _local_tag,
    auto_target_element_id,
    called_element_id,
    element_type,
    extract_embedded_process_xml,
    extract_subprocess_xml,
    find_bpmn_element,
    resolve_target_element_id,
)

SAMPLE_BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="Process_main" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:callActivity id="CallActivity_1" calledElement="Process_sub" />
    <bpmn:subProcess id="SubProcess_1">
      <bpmn:userTask id="UserTask_in_sub" />
    </bpmn:subProcess>
    <bpmn:userTask id="UserTask_main" />
    <bpmn:task id="Task_main" />
  </bpmn:process>
  <bpmn:process id="Process_sub">
    <bpmn:startEvent id="StartEvent_sub" />
    <bpmn:userTask id="UserTask_sub" />
  </bpmn:process>
</bpmn:definitions>
"""


def test_find_bpmn_element_returns_element():
    el = find_bpmn_element(SAMPLE_BPMN, "CallActivity_1")
    assert el is not None
    assert el.attrib.get("id") == "CallActivity_1"


def test_find_bpmn_element_missing_returns_none():
    assert find_bpmn_element(SAMPLE_BPMN, "Missing") is None


def test_element_type():
    assert element_type(SAMPLE_BPMN, "CallActivity_1") == "callactivity"
    assert element_type(SAMPLE_BPMN, "SubProcess_1") == "subprocess"
    assert element_type(SAMPLE_BPMN, "UserTask_main") == "usertask"
    assert element_type(SAMPLE_BPMN, "Missing") is None


def test_called_element_id():
    assert called_element_id(SAMPLE_BPMN, "CallActivity_1") == "Process_sub"
    assert called_element_id(SAMPLE_BPMN, "Missing") is None
    assert called_element_id(SAMPLE_BPMN, "SubProcess_1") is None


def test_extract_embedded_process_xml():
    xml = extract_embedded_process_xml(SAMPLE_BPMN, "Process_sub")
    assert xml is not None
    root = ET.fromstring(xml)
    assert root.attrib.get("id") == "Process_sub"
    tags = {_local_tag(el.tag) for el in root.iter()}
    assert "usertask" in tags
    assert "startevent" in tags


def test_extract_subprocess_xml_call_activity():
    xml = extract_subprocess_xml(SAMPLE_BPMN, "CallActivity_1")
    assert xml is not None
    root = ET.fromstring(xml)
    assert root.attrib.get("id") == "Process_sub"


def test_extract_subprocess_xml_embedded_subprocess():
    xml = extract_subprocess_xml(SAMPLE_BPMN, "SubProcess_1")
    assert xml is not None
    root = ET.fromstring(xml)
    assert root.attrib.get("id") == "SubProcess_1"
    tags = {_local_tag(el.tag) for el in root.iter()}
    assert "usertask" in tags


def test_auto_target_element_id_prefers_user_task():
    # Returns the first userTask found in document order.
    assert auto_target_element_id(SAMPLE_BPMN) == "UserTask_in_sub"


def test_resolve_target_element_id_explicit_override():
    assert resolve_target_element_id(SAMPLE_BPMN, explicit_target_id="UserTask_sub") == "UserTask_sub"
    assert resolve_target_element_id(SAMPLE_BPMN, explicit_target_id="Missing") == "UserTask_in_sub"
    assert resolve_target_element_id(SAMPLE_BPMN) == "UserTask_in_sub"
