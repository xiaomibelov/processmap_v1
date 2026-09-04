"""re_embed_child_xml_into_parent: preservation of boundary-referencing flows.

Dialect (feature #43, see test_bpmn_subprocess_clipboard.py fixtures): a
subProcess may contain messageFlow / dataInputAssociation / sequenceFlow whose
sourceRef/targetRef point OUTSIDE the subProcess (external dataStoreReference
living in the parent process).  The child session XML is a standalone document
where those references dangle; the frontend moddle drops the flow ("unparsable
content") and the child save no longer contains it.  re_embed must restore the
parent-side copy instead of silently losing the link.

Temp-XML only, no DB.
"""

import xml.etree.ElementTree as ET

from app.services.bpmn_navigation import (
    extract_subprocess_xml,
    re_embed_child_xml_into_parent,
)

BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
BPMNDI_NS = "http://www.omg.org/spec/BPMN/20100524/DI"
DI_NS = "http://www.omg.org/spec/DD/20100524/DI"


PARENT_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="Definitions_Resync" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_Resync" isExecutable="false">
    <bpmn:dataStoreReference id="DataStoreReference_External" name="Shared closure source">
      <bpmn:extensionElements>
        <zeebe:properties>
          <zeebe:property name="tara" value="Ящик внутриоборотный" />
        </zeebe:properties>
      </bpmn:extensionElements>
    </bpmn:dataStoreReference>
    <bpmn:subProcess id="SubProcess_Resync_1" name="Check closure">
      <bpmn:task id="Task_Internal_1" zeebe:modelerTemplate="com.example.task">
        <bpmn:incoming>Seq_1</bpmn:incoming>
        <bpmn:outgoing>Seq_2</bpmn:outgoing>
      </bpmn:task>
      <bpmn:task id="Task_Internal_2">
        <bpmn:incoming>Seq_2</bpmn:incoming>
      </bpmn:task>
      <bpmn:sequenceFlow id="Seq_1" sourceRef="DataStoreReference_External" targetRef="Task_Internal_1" />
      <bpmn:sequenceFlow id="Seq_2" sourceRef="Task_Internal_1" targetRef="Task_Internal_2" />
      <bpmn:messageFlow id="MsgFlow_External_1" sourceRef="Task_Internal_1" targetRef="DataStoreReference_External" name="status update" />
      <bpmn:dataInputAssociation id="DataInputAssoc_1">
        <bpmn:sourceRef>DataStoreReference_External</bpmn:sourceRef>
        <bpmn:targetRef>Task_Internal_1</bpmn:targetRef>
      </bpmn:dataInputAssociation>
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_Resync">
    <bpmndi:BPMNPlane id="BPMNPlane_Resync" bpmnElement="Process_Resync">
      <bpmndi:BPMNShape id="Task_Internal_1_di" bpmnElement="Task_Internal_1">
        <dc:Bounds x="320" y="213" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="MsgFlow_External_1_di" bpmnElement="MsgFlow_External_1">
        <di:waypoint x="320" y="260" />
        <di:waypoint x="130" y="305" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="GhostEdge_di" bpmnElement="GhostEdge_Removed_In_Child">
        <di:waypoint x="0" y="0" />
        <di:waypoint x="10" y="10" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


def _child_without_external_flows() -> str:
    """Simulate the child session save: moddle dropped flows with dangling refs."""
    child = extract_subprocess_xml(PARENT_XML, "SubProcess_Resync_1")
    assert child is not None
    root = ET.fromstring(child)
    for el in list(root.iter()):
        if el.tag == f"{{{BPMN_NS}}}messageFlow" or el.tag == f"{{{BPMN_NS}}}dataInputAssociation":
            parent = next((p for p in root.iter() for c in p if c is el), None)
            if parent is not None:
                parent.remove(el)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8")


def _child_with_degraded_messageflow() -> str:
    """Child kept the messageFlow but lost its external targetRef (moddle could
    not resolve the dangling dataStoreReference)."""
    child = extract_subprocess_xml(PARENT_XML, "SubProcess_Resync_1")
    assert child is not None
    root = ET.fromstring(child)
    flow = next(el for el in root.iter(f"{{{BPMN_NS}}}messageFlow"))
    flow.attrib.pop("targetRef", None)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8")


def _child_with_collaboration(xml: str) -> str:
    """Wrap a child document with an empty <bpmn:collaboration> (hoisted-docs
    dialect): element ids missing from the whole document are intentional
    deletions."""
    root = ET.fromstring(xml)
    root.insert(0, ET.Element(f"{{{BPMN_NS}}}collaboration", {"id": "Collaboration_Child"}))
    return ET.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8")


def _semantic_ids(root: ET.Element) -> set:
    ids = set()
    for el in root.iter():
        if el.tag.startswith("{http://www.omg.org/spec/BPMN/20100524/DI}"):
            continue
        el_id = str(el.attrib.get("id") or "").strip()
        if el_id:
            ids.add(el_id)
    return ids


def test_messageflow_to_external_datastore_survives_reembed():
    out = re_embed_child_xml_into_parent(PARENT_XML, "SubProcess_Resync_1", _child_without_external_flows())
    assert out is not None
    root = ET.fromstring(out)
    sp = next(el for el in root.iter() if el.attrib.get("id") == "SubProcess_Resync_1")
    flows = [el for el in sp.iter(f"{{{BPMN_NS}}}messageFlow")]
    assert [el.attrib.get("id") for el in flows] == ["MsgFlow_External_1"]
    assert flows[0].attrib.get("sourceRef") == "Task_Internal_1"
    assert flows[0].attrib.get("targetRef") == "DataStoreReference_External"


def test_datainputassociation_with_external_source_survives_reembed():
    out = re_embed_child_xml_into_parent(PARENT_XML, "SubProcess_Resync_1", _child_without_external_flows())
    root = ET.fromstring(out)
    assoc = next((el for el in root.iter(f"{{{BPMN_NS}}}dataInputAssociation")), None)
    assert assoc is not None
    source_ref = next(el for el in assoc if el.tag == f"{{{BPMN_NS}}}sourceRef")
    assert (source_ref.text or "").strip() == "DataStoreReference_External"


def test_sequenceflow_with_external_datastore_source_survives_reembed():
    child = _child_without_external_flows()
    # Child kept Seq_1/Seq_2 (sequenceFlow survives moddle); also verify the
    # external-source sequenceFlow is not duplicated by the preserve list.
    out = re_embed_child_xml_into_parent(PARENT_XML, "SubProcess_Resync_1", child)
    root = ET.fromstring(out)
    sp = next(el for el in root.iter() if el.attrib.get("id") == "SubProcess_Resync_1")
    seqs = [el for el in sp.iter(f"{{{BPMN_NS}}}sequenceFlow")]
    by_id = {}
    for el in seqs:
        by_id.setdefault(el.attrib.get("id"), 0)
        by_id[el.attrib.get("id")] += 1
    assert by_id.get("Seq_1") == 1
    assert by_id.get("Seq_2") == 1
    seq1 = next(el for el in seqs if el.attrib.get("id") == "Seq_1")
    assert seq1.attrib.get("sourceRef") == "DataStoreReference_External"


def test_zeebe_prefix_not_rewritten_to_ns1():
    out = re_embed_child_xml_into_parent(PARENT_XML, "SubProcess_Resync_1", _child_without_external_flows())
    assert "ns1:" not in out
    assert "zeebe:modelerTemplate" in out
    assert "zeebe:property" in out


def test_orphan_bpmnedge_is_collected_on_reembed():
    out = re_embed_child_xml_into_parent(PARENT_XML, "SubProcess_Resync_1", _child_without_external_flows())
    root = ET.fromstring(out)
    semantic = _semantic_ids(root)
    di_edges = [el for el in root.iter(f"{{{BPMNDI_NS}}}BPMNEdge")]
    orphans = [el for el in di_edges if str(el.attrib.get("bpmnElement") or "") not in semantic]
    assert orphans == []
    assert any(el.attrib.get("bpmnElement") == "MsgFlow_External_1" for el in di_edges)


def test_reembed_is_idempotent():
    once = re_embed_child_xml_into_parent(PARENT_XML, "SubProcess_Resync_1", _child_without_external_flows())
    twice = re_embed_child_xml_into_parent(once, "SubProcess_Resync_1", _child_without_external_flows())
    assert once == twice


def test_degraded_child_messageflow_merges_parent_targetref():
    out = re_embed_child_xml_into_parent(PARENT_XML, "SubProcess_Resync_1", _child_with_degraded_messageflow())
    assert out is not None
    root = ET.fromstring(out)
    sp = next(el for el in root.iter() if el.attrib.get("id") == "SubProcess_Resync_1")
    flows = [el for el in sp.iter(f"{{{BPMN_NS}}}messageFlow")]
    assert [el.attrib.get("id") for el in flows] == ["MsgFlow_External_1"]
    assert flows[0].attrib.get("sourceRef") == "Task_Internal_1"
    assert flows[0].attrib.get("targetRef") == "DataStoreReference_External"


def test_nonempty_child_targetref_is_not_overwritten_by_parent():
    root = ET.fromstring(_child_with_degraded_messageflow())
    flow = next(el for el in root.iter(f"{{{BPMN_NS}}}messageFlow"))
    flow.attrib["targetRef"] = "DataStoreReference_Child_Choice"
    child = ET.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8")
    out = re_embed_child_xml_into_parent(PARENT_XML, "SubProcess_Resync_1", child)
    assert out is not None
    root = ET.fromstring(out)
    flow = next(el for el in root.iter(f"{{{BPMN_NS}}}messageFlow"))
    assert flow.attrib.get("targetRef") == "DataStoreReference_Child_Choice"


def test_degraded_child_datainputassociation_merges_nested_sourceref():
    child = extract_subprocess_xml(PARENT_XML, "SubProcess_Resync_1")
    assert child is not None
    root = ET.fromstring(child)
    assoc = next(el for el in root.iter(f"{{{BPMN_NS}}}dataInputAssociation"))
    sref = next(el for el in assoc if el.tag == f"{{{BPMN_NS}}}sourceRef")
    sref.text = ""
    child = ET.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8")
    out = re_embed_child_xml_into_parent(PARENT_XML, "SubProcess_Resync_1", child)
    assert out is not None
    root = ET.fromstring(out)
    assoc = next(el for el in root.iter(f"{{{BPMN_NS}}}dataInputAssociation"))
    sref = next(el for el in assoc if el.tag == f"{{{BPMN_NS}}}sourceRef")
    assert (sref.text or "").strip() == "DataStoreReference_External"


def test_intentional_deletion_with_collaboration_is_not_resurrected():
    child = _child_with_collaboration(_child_without_external_flows())
    out = re_embed_child_xml_into_parent(PARENT_XML, "SubProcess_Resync_1", child)
    assert out is not None
    root = ET.fromstring(out)
    sp = next(el for el in root.iter() if el.attrib.get("id") == "SubProcess_Resync_1")
    sp_ids = {el.attrib.get("id") for el in sp.iter()}
    assert "MsgFlow_External_1" not in sp_ids
    assert "DataInputAssoc_1" not in sp_ids
    di_edges = [el for el in root.iter(f"{{{BPMNDI_NS}}}BPMNEdge")]
    assert not any(el.attrib.get("bpmnElement") == "MsgFlow_External_1" for el in di_edges)


def test_missing_element_without_collaboration_is_reinjected():
    child = _child_without_external_flows()
    root = ET.fromstring(child)
    assert not any(el.tag == f"{{{BPMN_NS}}}collaboration" for el in root.iter())
    out = re_embed_child_xml_into_parent(PARENT_XML, "SubProcess_Resync_1", child)
    assert out is not None
    root = ET.fromstring(out)
    sp = next(el for el in root.iter() if el.attrib.get("id") == "SubProcess_Resync_1")
    assert any(el.attrib.get("id") == "MsgFlow_External_1" for el in sp.iter())


def test_merge_is_idempotent_on_repeated_reembed():
    once = re_embed_child_xml_into_parent(PARENT_XML, "SubProcess_Resync_1", _child_with_degraded_messageflow())
    assert once is not None
    twice = re_embed_child_xml_into_parent(once, "SubProcess_Resync_1", _child_with_degraded_messageflow())
    assert once == twice


def test_extract_roundtrip_keeps_zeebe_prefix():
    child = extract_subprocess_xml(PARENT_XML, "SubProcess_Resync_1")
    assert "ns1:" not in child
    assert "zeebe:modelerTemplate" in child
