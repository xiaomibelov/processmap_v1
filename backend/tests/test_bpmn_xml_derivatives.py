"""F1 (perf/save-put-parse-once-and-publish-scan-v1): parse-once + кэш sha1(xml).

Паритет производных (bpmn_xml_derivatives) с исходными обёртками:
те же значения на валидном/невалидном XML, изоляция кэша от мутирования,
эквивалентность нормализации meta с precomputed camunda_ext.
"""
import copy

from app._legacy_main import (
    _collect_sequence_flow_meta,
    _count_bpmn_activities,
    _merge_and_normalize_bpmn_meta,
)
from app.camunda_meta_utils import extract_camunda_extensions_from_bpmn_xml
from app.services.bpmn_navigation import (
    find_child_session_element_ids,
    find_subprocess_elements,
)
from app.services.bpmn_xml_derivatives import (
    clear_bpmn_xml_derivatives_cache,
    get_bpmn_xml_derivatives,
)


_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
  xmlns:pm="http://processmap.ai/schema/bpmn/1.0"
  id="Defs_1" targetNamespace="ns">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="Start_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_A" name="A">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="k1" value="v1" />
          <camunda:property name="k2" value="v2" />
        </camunda:properties>
        <camunda:executionListener event="start" expression="${x}" />
        <pm:RobotMeta id="robot_1" />
        <foo:bar xmlns:foo="urn:foo" id="keep_1" />
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:exclusiveGateway id="Gw_1">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:subProcess id="Sub_1" name="Sub">
      <bpmn:task id="Task_inner" />
    </bpmn:subProcess>
    <bpmn:callActivity id="Call_1" calledElement="Ext_1" />
    <bpmn:endEvent id="End_1">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_A" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_A" targetRef="Gw_1" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Gw_1" targetRef="End_1" />
  </bpmn:process>
</bpmn:definitions>
"""

_BAD_XML = "<bpmn:definitions xmlns:bpmn='http://www.omg.org/spec/BPMN/20100524/MODEL'><bpmn:process>"


def test_derivatives_match_wrappers_on_valid_xml():
    clear_bpmn_xml_derivatives_cache()
    d = get_bpmn_xml_derivatives(_XML)

    legacy_flow = _collect_sequence_flow_meta(_XML)
    assert d.parseable is True
    assert d.flow_meta == legacy_flow
    assert d.activity_count == _count_bpmn_activities(_XML)
    assert d.camunda_extensions == extract_camunda_extensions_from_bpmn_xml(_XML)
    assert d.subprocess_elements == find_subprocess_elements(_XML)
    assert d.child_session_element_ids == find_child_session_element_ids(_XML)

    # конкретные значения, чтобы не «сравнение пустого с пустым»
    # userTask + subProcess + callActivity + task внутри subProcess
    assert d.activity_count == 4
    assert {"Task_A", "Sub_1", "Call_1", "Gw_1"} <= set(d.flow_meta["node_ids"])
    assert d.flow_meta["gateway_mode_by_node"] == {"Gw_1": "xor"}
    assert d.flow_meta["flow_source_by_id"]["Flow_2"] == "Task_A"
    assert d.subprocess_elements == [{"id": "Sub_1", "name": "Sub"}]
    assert {"Sub_1", "Call_1"} <= set(d.child_session_element_ids)
    ext = d.camunda_extensions["Task_A"]
    props = {p["name"]: p["value"] for p in ext["properties"]["extensionProperties"]}
    assert props == {"k1": "v1", "k2": "v2"}
    assert len(ext["properties"]["extensionListeners"]) == 1
    assert any("keep_1" in frag for frag in ext["preservedExtensionElements"])
    assert not any("RobotMeta" in frag or "robot_1" in frag
                 for frag in ext["preservedExtensionElements"])


def test_derivatives_match_wrapper_defaults_on_invalid_xml():
    clear_bpmn_xml_derivatives_cache()
    d = get_bpmn_xml_derivatives(_BAD_XML)

    assert d.parseable is False
    assert d.flow_meta == _collect_sequence_flow_meta(_BAD_XML)
    assert d.activity_count == _count_bpmn_activities(_BAD_XML) == 0
    assert d.camunda_extensions == extract_camunda_extensions_from_bpmn_xml(_BAD_XML) == {}
    assert d.subprocess_elements == find_subprocess_elements(_BAD_XML) == []
    assert d.child_session_element_ids == find_child_session_element_ids(_BAD_XML) == []


def test_derivatives_empty_and_whitespace_input():
    clear_bpmn_xml_derivatives_cache()
    for empty in ("", "   ", None):
        d = get_bpmn_xml_derivatives(empty)
        assert d.parseable is False
        assert d.activity_count == 0
        assert d.flow_meta["flow_ids"] == set()
        assert d.subprocess_elements == []
        assert d.child_session_element_ids == []
        assert d.camunda_extensions == {}


def test_cache_returns_isolated_copies():
    clear_bpmn_xml_derivatives_cache()
    d1 = get_bpmn_xml_derivatives(_XML)
    d1.flow_meta["node_ids"].add("MUTATED")
    d1.camunda_extensions["Task_A"]["properties"]["extensionProperties"].append({"id": "x"})
    d1.subprocess_elements.append({"id": "FAKE", "name": None})
    d1.child_session_element_ids.append("FAKE_ID")

    d2 = get_bpmn_xml_derivatives(_XML)
    assert "MUTATED" not in d2.flow_meta["node_ids"]
    assert all(p.get("id") != "x" for p in d2.camunda_extensions["Task_A"]["properties"]["extensionProperties"])
    assert all(e.get("id") != "FAKE" for e in d2.subprocess_elements)
    assert "FAKE_ID" not in d2.child_session_element_ids
    # и свежая сверка с обёртками
    assert d2.flow_meta == _collect_sequence_flow_meta(_XML)


def test_merge_normalize_meta_with_precomputed_camunda_ext():
    flow_ctx = _collect_sequence_flow_meta(_XML)
    incoming = {"version": 3, "flow_meta": {"Flow_1": {"tier": "P0", "source": "manual"}}}

    meta_legacy, flag_legacy = _merge_and_normalize_bpmn_meta({}, incoming, _XML, flow_ctx)
    d = get_bpmn_xml_derivatives(_XML)
    meta_fast, flag_fast = _merge_and_normalize_bpmn_meta(
        {}, copy.deepcopy(incoming), _XML, flow_ctx, camunda_ext=d.camunda_extensions
    )
    assert flag_legacy == flag_fast
    assert meta_fast == meta_legacy
    assert meta_fast["camunda_extensions_by_element_id"] == extract_camunda_extensions_from_bpmn_xml(_XML)
