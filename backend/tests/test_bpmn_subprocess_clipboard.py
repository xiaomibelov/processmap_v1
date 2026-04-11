import json
import os
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


SOURCE_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_Source" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_Source" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_to_sub</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="SubProcess_1" name="Review package">
      <bpmn:incoming>Flow_to_sub</bpmn:incoming>
      <bpmn:outgoing>Flow_from_sub</bpmn:outgoing>
      <bpmn:startEvent id="SubStart_1" name="Sub start">
        <bpmn:outgoing>SF_1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:userTask id="InnerTask_1" name="Inner approve" camunda:assignee="ops">
        <bpmn:documentation>Inner task doc</bpmn:documentation>
        <bpmn:incoming>SF_1</bpmn:incoming>
        <bpmn:outgoing>SF_2</bpmn:outgoing>
        <bpmn:extensionElements>
          <camunda:properties>
            <camunda:property name="priority" value="high" />
          </camunda:properties>
        </bpmn:extensionElements>
      </bpmn:userTask>
      <bpmn:exclusiveGateway id="Gateway_1" name="Route">
        <bpmn:incoming>SF_2</bpmn:incoming>
        <bpmn:outgoing>SF_3</bpmn:outgoing>
      </bpmn:exclusiveGateway>
      <bpmn:serviceTask id="ServiceTask_1" name="Call risk engine" camunda:class="svc.Check">
        <bpmn:documentation>Service task doc</bpmn:documentation>
        <bpmn:incoming>SF_3</bpmn:incoming>
        <bpmn:outgoing>SF_4</bpmn:outgoing>
        <bpmn:extensionElements>
          <camunda:properties>
            <camunda:property name="service_level" value="gold" />
          </camunda:properties>
        </bpmn:extensionElements>
      </bpmn:serviceTask>
      <bpmn:endEvent id="SubEnd_1" name="Sub end">
        <bpmn:incoming>SF_4</bpmn:incoming>
      </bpmn:endEvent>
      <bpmn:sequenceFlow id="SF_1" sourceRef="SubStart_1" targetRef="InnerTask_1" />
      <bpmn:sequenceFlow id="SF_2" sourceRef="InnerTask_1" targetRef="Gateway_1" />
      <bpmn:sequenceFlow id="SF_3" sourceRef="Gateway_1" targetRef="ServiceTask_1" name="happy" />
      <bpmn:sequenceFlow id="SF_4" sourceRef="ServiceTask_1" targetRef="SubEnd_1" />
    </bpmn:subProcess>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_from_sub</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_to_sub" sourceRef="StartEvent_1" targetRef="SubProcess_1" />
    <bpmn:sequenceFlow id="Flow_from_sub" sourceRef="SubProcess_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_Source">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="100" y="220" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubProcess_1_di" bpmnElement="SubProcess_1" isExpanded="true">
        <dc:Bounds x="220" y="120" width="520" height="280" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubStart_1_di" bpmnElement="SubStart_1">
        <dc:Bounds x="260" y="240" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="InnerTask_1_di" bpmnElement="InnerTask_1">
        <dc:Bounds x="340" y="218" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1_di" bpmnElement="Gateway_1">
        <dc:Bounds x="500" y="233" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ServiceTask_1_di" bpmnElement="ServiceTask_1">
        <dc:Bounds x="590" y="218" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubEnd_1_di" bpmnElement="SubEnd_1">
        <dc:Bounds x="760" y="240" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="860" y="220" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_to_sub_di" bpmnElement="Flow_to_sub">
        <di:waypoint x="136" y="238" />
        <di:waypoint x="220" y="238" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SF_1_di" bpmnElement="SF_1">
        <di:waypoint x="296" y="258" />
        <di:waypoint x="340" y="258" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SF_2_di" bpmnElement="SF_2">
        <di:waypoint x="460" y="258" />
        <di:waypoint x="500" y="258" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SF_3_di" bpmnElement="SF_3">
        <di:waypoint x="550" y="258" />
        <di:waypoint x="590" y="258" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SF_4_di" bpmnElement="SF_4">
        <di:waypoint x="710" y="258" />
        <di:waypoint x="760" y="258" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_from_sub_di" bpmnElement="Flow_from_sub">
        <di:waypoint x="740" y="238" />
        <di:waypoint x="860" y="238" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


TARGET_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_Target" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_Target" isExecutable="false">
    <bpmn:startEvent id="TargetStart_1" name="Start">
      <bpmn:outgoing>TargetFlow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="TargetTask_1" name="Existing task">
      <bpmn:incoming>TargetFlow_1</bpmn:incoming>
      <bpmn:outgoing>TargetFlow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="TargetEnd_1" name="End">
      <bpmn:incoming>TargetFlow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="TargetFlow_1" sourceRef="TargetStart_1" targetRef="TargetTask_1" />
    <bpmn:sequenceFlow id="TargetFlow_2" sourceRef="TargetTask_1" targetRef="TargetEnd_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_Target">
    <bpmndi:BPMNPlane id="BPMNPlane_Target" bpmnElement="Process_Target">
      <bpmndi:BPMNShape id="TargetStart_1_di" bpmnElement="TargetStart_1">
        <dc:Bounds x="100" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="TargetTask_1_di" bpmnElement="TargetTask_1">
        <dc:Bounds x="220" y="78" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="TargetEnd_1_di" bpmnElement="TargetEnd_1">
        <dc:Bounds x="430" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="TargetFlow_1_di" bpmnElement="TargetFlow_1">
        <di:waypoint x="136" y="118" />
        <di:waypoint x="220" y="118" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="TargetFlow_2_di" bpmnElement="TargetFlow_2">
        <di:waypoint x="340" y="118" />
        <di:waypoint x="430" y="118" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


PLANE_BACKED_COLLAPSED_SUBPROCESS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_CollapsedPlane" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_CollapsedPlane" isExecutable="false">
    <bpmn:startEvent id="CollapsedStartEvent_1" name="Start">
      <bpmn:outgoing>CollapsedFlow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="CollapsedSubProcess_1" name="Collapsed Source">
      <bpmn:incoming>CollapsedFlow_1</bpmn:incoming>
      <bpmn:outgoing>CollapsedFlow_2</bpmn:outgoing>
      <bpmn:startEvent id="CollapsedSubStart_1">
        <bpmn:outgoing>CollapsedSubFlow_1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:task id="CollapsedInnerTask_1" name="Inner task">
        <bpmn:incoming>CollapsedSubFlow_1</bpmn:incoming>
        <bpmn:outgoing>CollapsedSubFlow_2</bpmn:outgoing>
      </bpmn:task>
      <bpmn:endEvent id="CollapsedSubEnd_1">
        <bpmn:incoming>CollapsedSubFlow_2</bpmn:incoming>
      </bpmn:endEvent>
      <bpmn:sequenceFlow id="CollapsedSubFlow_1" sourceRef="CollapsedSubStart_1" targetRef="CollapsedInnerTask_1" />
      <bpmn:sequenceFlow id="CollapsedSubFlow_2" sourceRef="CollapsedInnerTask_1" targetRef="CollapsedSubEnd_1" />
    </bpmn:subProcess>
    <bpmn:task id="CollapsedNeighborTask_1" name="Neighbor task">
      <bpmn:incoming>CollapsedFlow_2</bpmn:incoming>
    </bpmn:task>
    <bpmn:sequenceFlow id="CollapsedFlow_1" sourceRef="CollapsedStartEvent_1" targetRef="CollapsedSubProcess_1" />
    <bpmn:sequenceFlow id="CollapsedFlow_2" sourceRef="CollapsedSubProcess_1" targetRef="CollapsedNeighborTask_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_CollapsedPlane_Main">
    <bpmndi:BPMNPlane id="BPMNPlane_CollapsedPlane_Main" bpmnElement="Process_CollapsedPlane">
      <bpmndi:BPMNShape id="CollapsedStartEvent_1_di" bpmnElement="CollapsedStartEvent_1">
        <dc:Bounds x="160" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="CollapsedSubProcess_1_di" bpmnElement="CollapsedSubProcess_1" isExpanded="false">
        <dc:Bounds x="260" y="128" width="180" height="110" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="CollapsedNeighborTask_1_di" bpmnElement="CollapsedNeighborTask_1">
        <dc:Bounds x="540" y="143" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="CollapsedFlow_1_di" bpmnElement="CollapsedFlow_1">
        <di:waypoint x="196" y="178" />
        <di:waypoint x="260" y="183" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="CollapsedFlow_2_di" bpmnElement="CollapsedFlow_2">
        <di:waypoint x="440" y="183" />
        <di:waypoint x="540" y="183" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="CollapsedSubProcess_1_diagram">
    <bpmndi:BPMNPlane id="CollapsedSubProcess_1_plane" bpmnElement="CollapsedSubProcess_1">
      <bpmndi:BPMNShape id="CollapsedSubStart_1_di" bpmnElement="CollapsedSubStart_1">
        <dc:Bounds x="120" y="120" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="CollapsedInnerTask_1_di" bpmnElement="CollapsedInnerTask_1">
        <dc:Bounds x="220" y="98" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="CollapsedSubEnd_1_di" bpmnElement="CollapsedSubEnd_1">
        <dc:Bounds x="440" y="120" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="CollapsedSubFlow_1_di" bpmnElement="CollapsedSubFlow_1">
        <di:waypoint x="156" y="138" />
        <di:waypoint x="220" y="138" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="CollapsedSubFlow_2_di" bpmnElement="CollapsedSubFlow_2">
        <di:waypoint x="360" y="138" />
        <di:waypoint x="440" y="138" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


UNSUPPORTED_SUBPROCESS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_Bad" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_Bad" isExecutable="false">
    <bpmn:subProcess id="SubProcess_Bad" name="Unsupported">
      <bpmn:startEvent id="SubStart_bad" />
      <bpmn:intermediateCatchEvent id="Timer_1" />
      <bpmn:endEvent id="SubEnd_bad" />
      <bpmn:sequenceFlow id="Bad_Flow_1" sourceRef="SubStart_bad" targetRef="Timer_1" />
      <bpmn:sequenceFlow id="Bad_Flow_2" sourceRef="Timer_1" targetRef="SubEnd_bad" />
    </bpmn:subProcess>
  </bpmn:process>
</bpmn:definitions>
"""


PLACEHOLDER_PROPERTY_SUBPROCESS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_Placeholder" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_Placeholder" isExecutable="false">
    <bpmn:subProcess id="StageLikeSubProcess_1" name="Add ingredient cream">
      <bpmn:property id="Property_placeholder_1" name="__targetRef_placeholder" />
      <bpmn:dataInputAssociation id="DataInputAssociation_placeholder_1">
        <bpmn:sourceRef>NestedTask_1</bpmn:sourceRef>
        <bpmn:targetRef>Property_placeholder_1</bpmn:targetRef>
      </bpmn:dataInputAssociation>
      <bpmn:subProcess id="NestedSubProcess_1" name="Add ingredient">
        <bpmn:startEvent id="NestedStart_1">
          <bpmn:outgoing>NestedFlow_1</bpmn:outgoing>
        </bpmn:startEvent>
        <bpmn:task id="NestedTask_1" name="Weigh ingredient">
          <bpmn:incoming>NestedFlow_1</bpmn:incoming>
          <bpmn:outgoing>NestedFlow_2</bpmn:outgoing>
        </bpmn:task>
        <bpmn:intermediateThrowEvent id="NestedThrow_1">
          <bpmn:incoming>NestedFlow_2</bpmn:incoming>
        </bpmn:intermediateThrowEvent>
        <bpmn:sequenceFlow id="NestedFlow_1" sourceRef="NestedStart_1" targetRef="NestedTask_1" />
        <bpmn:sequenceFlow id="NestedFlow_2" sourceRef="NestedTask_1" targetRef="NestedThrow_1" />
      </bpmn:subProcess>
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_Placeholder">
    <bpmndi:BPMNPlane id="BPMNPlane_Placeholder" bpmnElement="Process_Placeholder">
      <bpmndi:BPMNShape id="StageLikeSubProcess_1_di" bpmnElement="StageLikeSubProcess_1" isExpanded="true">
        <dc:Bounds x="200" y="140" width="520" height="260" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="NestedSubProcess_1_di" bpmnElement="NestedSubProcess_1" isExpanded="true">
        <dc:Bounds x="250" y="180" width="420" height="180" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="NestedStart_1_di" bpmnElement="NestedStart_1">
        <dc:Bounds x="290" y="245" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="NestedTask_1_di" bpmnElement="NestedTask_1">
        <dc:Bounds x="380" y="223" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="NestedThrow_1_di" bpmnElement="NestedThrow_1">
        <dc:Bounds x="560" y="245" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="NestedFlow_1_di" bpmnElement="NestedFlow_1">
        <di:waypoint x="326" y="263" />
        <di:waypoint x="380" y="263" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="NestedFlow_2_di" bpmnElement="NestedFlow_2">
        <di:waypoint x="500" y="263" />
        <di:waypoint x="560" y="263" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


INLINE_DATASTORE_SUBPROCESS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_DataStore" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_DataStore" isExecutable="false">
    <bpmn:subProcess id="StageLikeDataStoreSubProcess_1" name="Check vessel closure">
      <bpmn:property id="Property_data_store_1" name="__targetRef_placeholder" />
      <bpmn:dataInputAssociation id="DataInputAssociation_data_store_1">
        <bpmn:sourceRef>DataStoreReference_1</bpmn:sourceRef>
        <bpmn:targetRef>Property_data_store_1</bpmn:targetRef>
      </bpmn:dataInputAssociation>
      <bpmn:startEvent id="StageDataStoreStart_1">
        <bpmn:outgoing>StageDataStoreFlow_1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:task id="StageDataStoreTask_1" name="Inspect lid">
        <bpmn:incoming>StageDataStoreFlow_1</bpmn:incoming>
        <bpmn:outgoing>StageDataStoreFlow_2</bpmn:outgoing>
      </bpmn:task>
      <bpmn:exclusiveGateway id="StageDataStoreGateway_1" name="Closed?">
        <bpmn:incoming>StageDataStoreFlow_2</bpmn:incoming>
        <bpmn:outgoing>StageDataStoreFlow_3</bpmn:outgoing>
      </bpmn:exclusiveGateway>
      <bpmn:intermediateThrowEvent id="StageDataStoreThrow_1">
        <bpmn:incoming>StageDataStoreFlow_3</bpmn:incoming>
        <bpmn:outgoing>StageDataStoreFlow_4</bpmn:outgoing>
      </bpmn:intermediateThrowEvent>
      <bpmn:task id="StageDataStoreTask_2" name="Seal vessel">
        <bpmn:incoming>StageDataStoreFlow_4</bpmn:incoming>
        <bpmn:outgoing>StageDataStoreFlow_5</bpmn:outgoing>
      </bpmn:task>
      <bpmn:endEvent id="StageDataStoreEnd_1">
        <bpmn:incoming>StageDataStoreFlow_5</bpmn:incoming>
      </bpmn:endEvent>
      <bpmn:sequenceFlow id="StageDataStoreFlow_1" sourceRef="StageDataStoreStart_1" targetRef="StageDataStoreTask_1" />
      <bpmn:sequenceFlow id="StageDataStoreFlow_2" sourceRef="StageDataStoreTask_1" targetRef="StageDataStoreGateway_1" />
      <bpmn:sequenceFlow id="StageDataStoreFlow_3" sourceRef="StageDataStoreGateway_1" targetRef="StageDataStoreThrow_1" />
      <bpmn:sequenceFlow id="StageDataStoreFlow_4" sourceRef="StageDataStoreThrow_1" targetRef="StageDataStoreTask_2" />
      <bpmn:sequenceFlow id="StageDataStoreFlow_5" sourceRef="StageDataStoreTask_2" targetRef="StageDataStoreEnd_1" />
      <bpmn:dataStoreReference id="DataStoreReference_1" name="Closure source" />
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_DataStore">
    <bpmndi:BPMNPlane id="BPMNPlane_DataStore" bpmnElement="Process_DataStore">
      <bpmndi:BPMNShape id="StageLikeDataStoreSubProcess_1_di" bpmnElement="StageLikeDataStoreSubProcess_1" isExpanded="true">
        <dc:Bounds x="160" y="120" width="620" height="300" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StageDataStoreStart_1_di" bpmnElement="StageDataStoreStart_1">
        <dc:Bounds x="220" y="230" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StageDataStoreTask_1_di" bpmnElement="StageDataStoreTask_1">
        <dc:Bounds x="310" y="208" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StageDataStoreGateway_1_di" bpmnElement="StageDataStoreGateway_1">
        <dc:Bounds x="480" y="223" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StageDataStoreThrow_1_di" bpmnElement="StageDataStoreThrow_1">
        <dc:Bounds x="580" y="230" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StageDataStoreTask_2_di" bpmnElement="StageDataStoreTask_2">
        <dc:Bounds x="660" y="208" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StageDataStoreEnd_1_di" bpmnElement="StageDataStoreEnd_1">
        <dc:Bounds x="840" y="230" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="DataStoreReference_1_di" bpmnElement="DataStoreReference_1">
        <dc:Bounds x="500" y="330" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="StageDataStoreFlow_1_di" bpmnElement="StageDataStoreFlow_1">
        <di:waypoint x="256" y="248" />
        <di:waypoint x="310" y="248" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="StageDataStoreFlow_2_di" bpmnElement="StageDataStoreFlow_2">
        <di:waypoint x="430" y="248" />
        <di:waypoint x="480" y="248" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="StageDataStoreFlow_3_di" bpmnElement="StageDataStoreFlow_3">
        <di:waypoint x="530" y="248" />
        <di:waypoint x="580" y="248" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="StageDataStoreFlow_4_di" bpmnElement="StageDataStoreFlow_4">
        <di:waypoint x="616" y="248" />
        <di:waypoint x="660" y="248" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="StageDataStoreFlow_5_di" bpmnElement="StageDataStoreFlow_5">
        <di:waypoint x="780" y="248" />
        <di:waypoint x="840" y="248" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


EXTERNAL_AUXILIARY_REF_SUBPROCESS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_ExternalAux" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_ExternalAux" isExecutable="false">
    <bpmn:dataStoreReference id="DataStoreReference_External" name="Shared closure source" />
    <bpmn:subProcess id="SubProcess_ExternalAux_1" name="Check vessel closure">
      <bpmn:property id="Property_external_aux_1" name="__targetRef_placeholder" />
      <bpmn:dataInputAssociation id="DataInputAssociation_external_aux_1">
        <bpmn:sourceRef>DataStoreReference_External</bpmn:sourceRef>
        <bpmn:targetRef>Property_external_aux_1</bpmn:targetRef>
      </bpmn:dataInputAssociation>
      <bpmn:startEvent id="ExternalAuxStart_1">
        <bpmn:outgoing>ExternalAuxFlow_1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:task id="ExternalAuxTask_1" name="Inspect lid">
        <bpmn:incoming>ExternalAuxFlow_1</bpmn:incoming>
        <bpmn:outgoing>ExternalAuxFlow_2</bpmn:outgoing>
      </bpmn:task>
      <bpmn:intermediateThrowEvent id="ExternalAuxThrow_1">
        <bpmn:incoming>ExternalAuxFlow_2</bpmn:incoming>
      </bpmn:intermediateThrowEvent>
      <bpmn:sequenceFlow id="ExternalAuxFlow_1" sourceRef="ExternalAuxStart_1" targetRef="ExternalAuxTask_1" />
      <bpmn:sequenceFlow id="ExternalAuxFlow_2" sourceRef="ExternalAuxTask_1" targetRef="ExternalAuxThrow_1" />
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_ExternalAux">
    <bpmndi:BPMNPlane id="BPMNPlane_ExternalAux" bpmnElement="Process_ExternalAux">
      <bpmndi:BPMNShape id="DataStoreReference_External_di" bpmnElement="DataStoreReference_External">
        <dc:Bounds x="90" y="260" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubProcess_ExternalAux_1_di" bpmnElement="SubProcess_ExternalAux_1" isExpanded="true">
        <dc:Bounds x="180" y="140" width="420" height="220" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ExternalAuxStart_1_di" bpmnElement="ExternalAuxStart_1">
        <dc:Bounds x="230" y="235" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ExternalAuxTask_1_di" bpmnElement="ExternalAuxTask_1">
        <dc:Bounds x="330" y="213" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ExternalAuxThrow_1_di" bpmnElement="ExternalAuxThrow_1">
        <dc:Bounds x="500" y="235" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="ExternalAuxFlow_1_di" bpmnElement="ExternalAuxFlow_1">
        <di:waypoint x="266" y="253" />
        <di:waypoint x="330" y="253" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="ExternalAuxFlow_2_di" bpmnElement="ExternalAuxFlow_2">
        <di:waypoint x="450" y="253" />
        <di:waypoint x="500" y="253" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


EXTERNAL_NON_DATASTORE_AUXILIARY_REF_SUBPROCESS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_ExternalAuxTask" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_ExternalAuxTask" isExecutable="false">
    <bpmn:task id="ExternalTask_1" name="Shared task ref" />
    <bpmn:subProcess id="SubProcess_ExternalAuxTask_1" name="Check vessel closure">
      <bpmn:property id="Property_external_aux_task_1" name="__targetRef_placeholder" />
      <bpmn:dataInputAssociation id="DataInputAssociation_external_aux_task_1">
        <bpmn:sourceRef>ExternalTask_1</bpmn:sourceRef>
        <bpmn:targetRef>Property_external_aux_task_1</bpmn:targetRef>
      </bpmn:dataInputAssociation>
      <bpmn:startEvent id="ExternalAuxTaskStart_1">
        <bpmn:outgoing>ExternalAuxTaskFlow_1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:task id="ExternalAuxTaskInner_1" name="Inspect lid">
        <bpmn:incoming>ExternalAuxTaskFlow_1</bpmn:incoming>
        <bpmn:outgoing>ExternalAuxTaskFlow_2</bpmn:outgoing>
      </bpmn:task>
      <bpmn:intermediateThrowEvent id="ExternalAuxTaskThrow_1">
        <bpmn:incoming>ExternalAuxTaskFlow_2</bpmn:incoming>
      </bpmn:intermediateThrowEvent>
      <bpmn:sequenceFlow id="ExternalAuxTaskFlow_1" sourceRef="ExternalAuxTaskStart_1" targetRef="ExternalAuxTaskInner_1" />
      <bpmn:sequenceFlow id="ExternalAuxTaskFlow_2" sourceRef="ExternalAuxTaskInner_1" targetRef="ExternalAuxTaskThrow_1" />
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_ExternalAuxTask">
    <bpmndi:BPMNPlane id="BPMNPlane_ExternalAuxTask" bpmnElement="Process_ExternalAuxTask">
      <bpmndi:BPMNShape id="ExternalTask_1_di" bpmnElement="ExternalTask_1">
        <dc:Bounds x="90" y="260" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubProcess_ExternalAuxTask_1_di" bpmnElement="SubProcess_ExternalAuxTask_1" isExpanded="true">
        <dc:Bounds x="220" y="140" width="420" height="220" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ExternalAuxTaskStart_1_di" bpmnElement="ExternalAuxTaskStart_1">
        <dc:Bounds x="270" y="235" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ExternalAuxTaskInner_1_di" bpmnElement="ExternalAuxTaskInner_1">
        <dc:Bounds x="370" y="213" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ExternalAuxTaskThrow_1_di" bpmnElement="ExternalAuxTaskThrow_1">
        <dc:Bounds x="540" y="235" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="ExternalAuxTaskFlow_1_di" bpmnElement="ExternalAuxTaskFlow_1">
        <di:waypoint x="306" y="253" />
        <di:waypoint x="370" y="253" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="ExternalAuxTaskFlow_2_di" bpmnElement="ExternalAuxTaskFlow_2">
        <di:waypoint x="490" y="253" />
        <di:waypoint x="540" y="253" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


def _local(tag: str) -> str:
    return str(tag or "").split("}", 1)[-1]


def _iter_local(root, local_name: str):
    q = str(local_name or "").lower()
    for el in root.iter():
        if _local(el.tag).lower() == q:
            yield el


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class _FakeRedis:
    def __init__(self):
        self.store = {}
        self.ttl = {}

    def get(self, key):
        return self.store.get(str(key))

    def set(self, key, value, ex=None):
        self.store[str(key)] = str(value)
        self.ttl[str(key)] = int(ex or 0)
        return True

    def setex(self, key, ttl, value):
        self.store[str(key)] = str(value)
        self.ttl[str(key)] = int(ttl or 0)
        return True

    def delete(self, key):
        cache_key = str(key)
        existed = cache_key in self.store
        self.store.pop(cache_key, None)
        self.ttl.pop(cache_key, None)
        return 1 if existed else 0

    def scan_iter(self, match=None, count=500):
        _ = count
        expr = str(match or "")
        prefix = expr[:-1] if expr.endswith("*") else expr
        for key in sorted(self.store.keys()):
            if not prefix or key.startswith(prefix):
                yield key


def _read_response(out):
    if hasattr(out, "status_code"):
        try:
            payload = json.loads((out.body or b"{}").decode("utf-8"))
        except Exception:
            payload = {}
        return int(getattr(out, "status_code", 0) or 0), payload
    return 200, out if isinstance(out, dict) else {}


class BpmnSubprocessClipboardTests(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_redis_required = os.environ.get("REDIS_REQUIRED")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)
        os.environ["REDIS_REQUIRED"] = "0"

        from app.auth import create_user
        from app._legacy_main import (
            BpmnXmlIn,
            CreateProjectIn,
            CreateSessionIn,
            create_project,
            create_project_session,
            get_storage,
            session_bpmn_save,
        )
        from app.clipboard.api import (
            ClipboardCopyIn,
            ClipboardPasteIn,
            copy_bpmn_element_to_clipboard,
            get_current_bpmn_clipboard,
            paste_bpmn_clipboard,
        )
        from app.clipboard.redis_store import clipboard_key
        from app.clipboard.serializer import ClipboardSerializationError, ClipboardSubprocessPayload, serialize_clipboard_payload
        from app.models import Node
        from app.storage import get_default_org_id, upsert_org_membership, upsert_project_membership

        self.BpmnXmlIn = BpmnXmlIn
        self.CreateProjectIn = CreateProjectIn
        self.CreateSessionIn = CreateSessionIn
        self.create_project = create_project
        self.create_project_session = create_project_session
        self.get_storage = get_storage
        self.session_bpmn_save = session_bpmn_save
        self.ClipboardCopyIn = ClipboardCopyIn
        self.ClipboardPasteIn = ClipboardPasteIn
        self.copy_bpmn_element_to_clipboard = copy_bpmn_element_to_clipboard
        self.get_current_bpmn_clipboard = get_current_bpmn_clipboard
        self.paste_bpmn_clipboard = paste_bpmn_clipboard
        self.clipboard_key = clipboard_key
        self.ClipboardSerializationError = ClipboardSerializationError
        self.ClipboardSubprocessPayload = ClipboardSubprocessPayload
        self.serialize_clipboard_payload = serialize_clipboard_payload
        self.Node = Node
        self.create_user = create_user
        self.get_default_org_id = get_default_org_id
        self.upsert_org_membership = upsert_org_membership
        self.upsert_project_membership = upsert_project_membership

        self.org_id = get_default_org_id()
        self.owner = create_user("subprocess_clipboard_owner@local", "admin", is_admin=False)
        self.upsert_org_membership(self.org_id, str(self.owner.get("id") or ""), "org_admin")

        source_project = self.create_project(self.CreateProjectIn(title="Source Project"), self._req(self.owner))
        target_project = self.create_project(self.CreateProjectIn(title="Target Project"), self._req(self.owner))
        self.source_project_id = str(source_project.get("id") or "")
        self.target_project_id = str(target_project.get("id") or "")

        source_session = self.create_project_session(
            self.source_project_id,
            self.CreateSessionIn(title="Source Session"),
            "quick_skeleton",
            request=self._req(self.owner),
        )
        target_session = self.create_project_session(
            self.target_project_id,
            self.CreateSessionIn(title="Target Session"),
            "quick_skeleton",
            request=self._req(self.owner),
        )
        self.source_session_id = str(source_session.get("id") or "")
        self.target_session_id = str(target_session.get("id") or "")
        self.assertTrue(self.source_session_id)
        self.assertTrue(self.target_session_id)

        self.assertTrue(bool(self.session_bpmn_save(self.source_session_id, self.BpmnXmlIn(xml=SOURCE_BPMN_XML), self._req(self.owner)).get("ok")))
        self.assertTrue(bool(self.session_bpmn_save(self.target_session_id, self.BpmnXmlIn(xml=TARGET_BPMN_XML), self._req(self.owner)).get("ok")))
        self._seed_source_state()

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
        if self.old_redis_required is None:
            os.environ.pop("REDIS_REQUIRED", None)
        else:
            os.environ["REDIS_REQUIRED"] = self.old_redis_required
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _req(self, user: dict):
        return _DummyRequest(user, active_org_id=self.org_id)

    def _seed_source_state(self):
        st = self.get_storage()
        sess = st.load(self.source_session_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(sess)
        sess.nodes = [
            self.Node(
                id="InnerTask_1",
                type="step",
                title="Inner approve",
                actor_role="ops",
                parameters={"service": "approval"},
            ),
            self.Node(
                id="ServiceTask_1",
                type="step",
                title="Call risk engine",
                actor_role="system",
                parameters={"service": "risk-engine"},
            ),
        ]
        sess.notes_by_element = {
            "InnerTask_1": {
                "summary": "Inner task notes",
                "items": [{"id": "n1", "text": "Check compliance", "createdAt": 1, "updatedAt": 1}],
            }
        }
        sess.bpmn_meta = {
            "version": 1,
            "flow_meta": {"SF_3": {"tier": "P0"}},
            "node_path_meta": {"InnerTask_1": {"paths": ["P0"], "sequence_key": "primary", "source": "manual"}},
            "robot_meta_by_element_id": {
                "InnerTask_1": {"robot_meta_version": "v1", "exec": {"mode": "machine", "action_key": "approve.run"}},
            },
            "camunda_extensions_by_element_id": {
                "InnerTask_1": {"properties": [{"name": "priority", "value": "high"}]},
                "ServiceTask_1": {"properties": [{"name": "service_level", "value": "gold"}]},
            },
            "presentation_by_element_id": {"InnerTask_1": {"badge": "ops"}},
            "hybrid_layer_by_element_id": {"InnerTask_1": {"dx": 6, "dy": 10}},
        }
        st.save(sess, user_id=str(self.owner.get("id") or ""), org_id=self.org_id, is_admin=True)

    def _create_session_with_xml(self, *, title: str, xml: str) -> str:
        project = self.create_project(self.CreateProjectIn(title=f"{title} Project"), self._req(self.owner))
        project_id = str(project.get("id") or "")
        session = self.create_project_session(
            project_id,
            self.CreateSessionIn(title=title),
            "quick_skeleton",
            request=self._req(self.owner),
        )
        session_id = str(session.get("id") or "")
        self.assertTrue(session_id)
        self.assertTrue(bool(self.session_bpmn_save(session_id, self.BpmnXmlIn(xml=xml), self._req(self.owner)).get("ok")))
        return session_id

    def test_serializer_builds_normalized_subprocess_payload(self):
        sess = self.get_storage().load(self.source_session_id, org_id=self.org_id, is_admin=True)
        payload = self.serialize_clipboard_payload(
            session_obj=sess,
            element_id="SubProcess_1",
            copied_by_user_id=str(self.owner.get("id") or ""),
            copied_at=1730000000,
            source_org_id=self.org_id,
        )
        self.assertIsInstance(payload, self.ClipboardSubprocessPayload)
        self.assertEqual(payload.clipboard_item_type, "bpmn_subprocess_subtree")
        self.assertEqual(payload.root.old_id, "SubProcess_1")
        self.assertEqual(payload.root.element_type, "subProcess")
        node_ids = {node.old_id for node in payload.fragment.nodes}
        self.assertEqual(node_ids, {"SubStart_1", "InnerTask_1", "Gateway_1", "ServiceTask_1", "SubEnd_1"})
        edge_ids = {edge.old_id for edge in payload.fragment.edges}
        self.assertEqual(edge_ids, {"SF_1", "SF_2", "SF_3", "SF_4"})
        self.assertNotIn("Flow_to_sub", edge_ids)
        inner_task = next(node for node in payload.fragment.nodes if node.old_id == "InnerTask_1")
        self.assertEqual(inner_task.parent_old_id, "SubProcess_1")
        self.assertEqual(inner_task.documentation, "Inner task doc")
        self.assertEqual(inner_task.task_local_state.get("camunda_extensions_by_element_id", {}).get("properties", [{}])[0].get("value"), "high")
        self.assertEqual(inner_task.task_local_state.get("notes_by_element", {}).get("summary"), "Inner task notes")
        self.assertEqual(inner_task.session_node.get("parameters", {}).get("service"), "approval")
        flow_sf3 = next(edge for edge in payload.fragment.edges if edge.old_id == "SF_3")
        self.assertEqual(flow_sf3.name, "happy")
        self.assertEqual(flow_sf3.edge_local_state.get("tier"), "P0")

    def test_copy_and_paste_roundtrip_restores_inner_semantics_with_new_ids(self):
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            copy_out = self.copy_bpmn_element_to_clipboard(
                self.ClipboardCopyIn(session_id=self.source_session_id, element_id="SubProcess_1"),
                self._req(self.owner),
            )
            copy_status, copy_body = _read_response(copy_out)
            self.assertEqual(copy_status, 200)
            self.assertEqual(str(copy_body.get("clipboard_item_type") or ""), "bpmn_subprocess_subtree")

            preview_out = self.get_current_bpmn_clipboard(self._req(self.owner))
            _, preview_body = _read_response(preview_out)
            self.assertEqual(bool(preview_body.get("empty")), False)
            self.assertEqual(str((preview_body.get("item") or {}).get("element_type") or ""), "subProcess")

            paste_out = self.paste_bpmn_clipboard(
                self.ClipboardPasteIn(session_id=self.target_session_id),
                self._req(self.owner),
            )
            paste_status, paste_body = _read_response(paste_out)
            self.assertEqual(paste_status, 200)
            self.assertTrue(bool(paste_body.get("ok")))
            pasted_root_id = str(paste_body.get("pasted_root_element_id") or "")
            created_node_ids = set(paste_body.get("created_node_ids") or [])
            created_edge_ids = set(paste_body.get("created_edge_ids") or [])
            self.assertTrue(pasted_root_id)
            self.assertIn(pasted_root_id, created_node_ids)
            self.assertEqual(len(created_node_ids), 6)
            self.assertEqual(len(created_edge_ids), 4)
            self.assertNotIn("SubProcess_1", created_node_ids)
            self.assertNotIn("SF_3", created_edge_ids)

        st = self.get_storage()
        reloaded = st.load(self.target_session_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(reloaded)
        root = ET.fromstring(str(getattr(reloaded, "bpmn_xml", "") or ""))
        pasted_subprocess = next((el for el in _iter_local(root, "subProcess") if str(el.attrib.get("id") or "").strip() == pasted_root_id), None)
        self.assertIsNotNone(pasted_subprocess)

        process_xml = str(getattr(reloaded, "bpmn_xml", "") or "")
        self.assertNotIn('id="SubProcess_1"', process_xml)
        self.assertNotIn('id="InnerTask_1"', process_xml)
        self.assertNotIn('sourceRef="SubStart_1"', process_xml)

        inner_task = next((el for el in _iter_local(pasted_subprocess, "userTask") if str(el.attrib.get("name") or "") == "Inner approve"), None)
        self.assertIsNotNone(inner_task)
        inner_task_id = str(inner_task.attrib.get("id") or "")
        self.assertNotEqual(inner_task_id, "InnerTask_1")
        self.assertEqual(str(inner_task.attrib.get("{http://camunda.org/schema/1.0/bpmn}assignee") or ""), "ops")
        doc = next(_iter_local(inner_task, "documentation"), None)
        self.assertEqual(str("".join(doc.itertext()) if doc is not None else ""), "Inner task doc")
        prop = next((el for el in _iter_local(inner_task, "property") if str(el.attrib.get("name") or "") == "priority"), None)
        self.assertIsNotNone(prop)
        self.assertEqual(str(prop.attrib.get("value") or ""), "high")

        service_task = next((el for el in _iter_local(pasted_subprocess, "serviceTask") if str(el.attrib.get("name") or "") == "Call risk engine"), None)
        self.assertIsNotNone(service_task)
        self.assertNotEqual(str(service_task.attrib.get("id") or ""), "ServiceTask_1")
        self.assertEqual(str(service_task.attrib.get("{http://camunda.org/schema/1.0/bpmn}class") or ""), "svc.Check")

        flow_happy = next((el for el in _iter_local(pasted_subprocess, "sequenceFlow") if str(el.attrib.get("name") or "") == "happy"), None)
        self.assertIsNotNone(flow_happy)
        flow_happy_id = str(flow_happy.attrib.get("id") or "")
        self.assertNotEqual(flow_happy_id, "SF_3")
        self.assertIn(str(flow_happy.attrib.get("sourceRef") or ""), created_node_ids)
        self.assertIn(str(flow_happy.attrib.get("targetRef") or ""), created_node_ids)

        meta = getattr(reloaded, "bpmn_meta", {}) if isinstance(getattr(reloaded, "bpmn_meta", {}), dict) else {}
        self.assertIn(inner_task_id, meta.get("camunda_extensions_by_element_id", {}))
        self.assertEqual(
            meta.get("camunda_extensions_by_element_id", {}).get(inner_task_id, {}).get("properties", [{}])[0].get("value"),
            "high",
        )
        self.assertIn(inner_task_id, meta.get("robot_meta_by_element_id", {}))
        self.assertEqual(
            meta.get("robot_meta_by_element_id", {}).get(inner_task_id, {}).get("exec", {}).get("action_key"),
            "approve.run",
        )
        self.assertIn(flow_happy_id, meta.get("flow_meta", {}))
        self.assertEqual(meta.get("flow_meta", {}).get(flow_happy_id, {}).get("tier"), "P0")
        self.assertIn(inner_task_id, getattr(reloaded, "notes_by_element", {}))
        self.assertEqual(getattr(reloaded, "notes_by_element", {}).get(inner_task_id, {}).get("summary"), "Inner task notes")
        self.assertTrue(any(str(getattr(node, "id", "") or "") == inner_task_id for node in list(getattr(reloaded, "nodes", []) or [])))

        # Save/reload proof: second load keeps remapped ids and inner state.
        second_reload = st.load(self.target_session_id, org_id=self.org_id, is_admin=True)
        self.assertIn(inner_task_id, getattr(second_reload, "bpmn_meta", {}).get("camunda_extensions_by_element_id", {}))
        self.assertIn(flow_happy_id, getattr(second_reload, "bpmn_meta", {}).get("flow_meta", {}))

    def test_plane_backed_collapsed_subprocess_roundtrip_restores_subtree_and_plane(self):
        source_session_id = self._create_session_with_xml(
            title="Plane backed collapsed subprocess",
            xml=PLANE_BACKED_COLLAPSED_SUBPROCESS_XML,
        )
        sess = self.get_storage().load(source_session_id, org_id=self.org_id, is_admin=True)
        payload = self.serialize_clipboard_payload(
            session_obj=sess,
            element_id="CollapsedSubProcess_1",
            copied_by_user_id=str(self.owner.get("id") or ""),
            copied_at=1730001111,
            source_org_id=self.org_id,
        )
        self.assertIsInstance(payload, self.ClipboardSubprocessPayload)
        self.assertEqual(payload.root.old_id, "CollapsedSubProcess_1")
        self.assertEqual(str((payload.root.di_shape_attributes or {}).get("isExpanded") or ""), "false")
        self.assertEqual(
            {node.old_id for node in payload.fragment.nodes},
            {"CollapsedSubStart_1", "CollapsedInnerTask_1", "CollapsedSubEnd_1"},
        )
        self.assertTrue(all(node.di_bounds is not None for node in payload.fragment.nodes))
        self.assertTrue(all(len(list(edge.di_waypoints or [])) == 2 for edge in payload.fragment.edges))

        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            copy_out = self.copy_bpmn_element_to_clipboard(
                self.ClipboardCopyIn(session_id=source_session_id, element_id="CollapsedSubProcess_1"),
                self._req(self.owner),
            )
            copy_status, copy_body = _read_response(copy_out)
            self.assertEqual(copy_status, 200)
            self.assertEqual(str(copy_body.get("clipboard_item_type") or ""), "bpmn_subprocess_subtree")

            preview_out = self.get_current_bpmn_clipboard(self._req(self.owner))
            preview_status, preview_body = _read_response(preview_out)
            self.assertEqual(preview_status, 200)
            self.assertEqual(bool(preview_body.get("empty")), False)

            paste_out = self.paste_bpmn_clipboard(
                self.ClipboardPasteIn(session_id=self.target_session_id),
                self._req(self.owner),
            )
            paste_status, paste_body = _read_response(paste_out)
            self.assertEqual(paste_status, 200)
            self.assertTrue(bool(paste_body.get("ok")))
            self.assertEqual(len(set(paste_body.get("created_node_ids") or [])), 4)
            self.assertEqual(len(set(paste_body.get("created_edge_ids") or [])), 2)

        reloaded = self.get_storage().load(self.target_session_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(reloaded)
        xml_text = str(getattr(reloaded, "bpmn_xml", "") or "")
        root = ET.fromstring(xml_text)
        pasted_root_id = str(paste_body.get("pasted_root_element_id") or "")
        self.assertTrue(pasted_root_id)

        process_subprocess = next(
            (el for el in _iter_local(root, "subProcess") if str(el.attrib.get("id") or "").strip() == pasted_root_id),
            None,
        )
        self.assertIsNotNone(process_subprocess)
        self.assertEqual(
            {str(el.attrib.get("id") or "").strip() for el in _iter_local(process_subprocess, "sequenceFlow")},
            set(paste_body.get("created_edge_ids") or []),
        )

        main_plane = next(
            (plane for plane in _iter_local(root, "BPMNPlane") if str(plane.attrib.get("bpmnElement") or "").strip() == "Process_Target"),
            None,
        )
        self.assertIsNotNone(main_plane)
        main_root_shape = next(
            (shape for shape in _iter_local(main_plane, "BPMNShape") if str(shape.attrib.get("bpmnElement") or "").strip() == pasted_root_id),
            None,
        )
        self.assertIsNotNone(main_root_shape)
        self.assertEqual(str(main_root_shape.attrib.get("isExpanded") or ""), "false")

        subprocess_plane = next(
            (plane for plane in _iter_local(root, "BPMNPlane") if str(plane.attrib.get("bpmnElement") or "").strip() == pasted_root_id),
            None,
        )
        self.assertIsNotNone(subprocess_plane)

        inner_shape_ids = {
            str(shape.attrib.get("bpmnElement") or "").strip()
            for shape in _iter_local(subprocess_plane, "BPMNShape")
        }
        inner_edge_ids = {
            str(edge.attrib.get("bpmnElement") or "").strip()
            for edge in _iter_local(subprocess_plane, "BPMNEdge")
        }
        created_node_ids = set(paste_body.get("created_node_ids") or [])
        created_node_ids.discard(pasted_root_id)
        self.assertEqual(inner_shape_ids, created_node_ids)
        self.assertEqual(inner_edge_ids, set(paste_body.get("created_edge_ids") or []))

        subprocess_plane_waypoints = list(_iter_local(subprocess_plane, "waypoint"))
        self.assertEqual(len(subprocess_plane_waypoints), 4)

        second_reload = self.get_storage().load(self.target_session_id, org_id=self.org_id, is_admin=True)
        self.assertIn(f'bpmnElement="{pasted_root_id}"', str(getattr(second_reload, "bpmn_xml", "") or ""))

    def test_stage_like_placeholder_property_subprocess_roundtrip_remaps_auxiliary_refs(self):
        source_session_id = self._create_session_with_xml(
            title="Stage-like placeholder subprocess",
            xml=PLACEHOLDER_PROPERTY_SUBPROCESS_XML,
        )
        sess = self.get_storage().load(source_session_id, org_id=self.org_id, is_admin=True)
        payload = self.serialize_clipboard_payload(
            session_obj=sess,
            element_id="StageLikeSubProcess_1",
            copied_by_user_id=str(self.owner.get("id") or ""),
            copied_at=1730001234,
            source_org_id=self.org_id,
        )
        self.assertIsInstance(payload, self.ClipboardSubprocessPayload)
        self.assertEqual(payload.root.old_id, "StageLikeSubProcess_1")
        self.assertEqual({node.old_id for node in payload.fragment.nodes}, {"NestedSubProcess_1", "NestedStart_1", "NestedTask_1", "NestedThrow_1"})
        property_payload = next(
            child for child in list(payload.root.extra_children or [])
            if str(child.get("type") or "") == "property"
        )
        self.assertEqual(str((property_payload.get("attributes") or {}).get("id") or ""), "Property_placeholder_1")
        self.assertEqual(str((property_payload.get("attributes") or {}).get("name") or ""), "__targetRef_placeholder")
        input_association = next(
            child for child in list(payload.root.extra_children or [])
            if str(child.get("type") or "") == "dataInputAssociation"
        )
        self.assertEqual(str((input_association.get("attributes") or {}).get("id") or ""), "DataInputAssociation_placeholder_1")
        target_ref = next(
            child for child in list(input_association.get("children") or [])
            if str(child.get("type") or "") == "targetRef"
        )
        self.assertEqual(str(target_ref.get("text") or ""), "Property_placeholder_1")

        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            copy_out = self.copy_bpmn_element_to_clipboard(
                self.ClipboardCopyIn(session_id=source_session_id, element_id="StageLikeSubProcess_1"),
                self._req(self.owner),
            )
            copy_status, copy_body = _read_response(copy_out)
            self.assertEqual(copy_status, 200)
            self.assertEqual(str(copy_body.get("clipboard_item_type") or ""), "bpmn_subprocess_subtree")
            self.assertEqual(str(copy_body.get("schema_version") or ""), "pm_bpmn_subprocess_subtree_clipboard_v2")

            preview_out = self.get_current_bpmn_clipboard(self._req(self.owner))
            preview_status, preview_body = _read_response(preview_out)
            self.assertEqual(preview_status, 200)
            self.assertEqual(bool(preview_body.get("empty")), False)

            paste_out = self.paste_bpmn_clipboard(
                self.ClipboardPasteIn(session_id=self.target_session_id),
                self._req(self.owner),
            )
            paste_status, paste_body = _read_response(paste_out)
            self.assertEqual(paste_status, 200)
            self.assertTrue(bool(paste_body.get("ok")))
            self.assertEqual(len(set(paste_body.get("created_node_ids") or [])), 5)
            self.assertEqual(len(set(paste_body.get("created_edge_ids") or [])), 2)

        reloaded = self.get_storage().load(self.target_session_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(reloaded)
        xml_text = str(getattr(reloaded, "bpmn_xml", "") or "")
        root = ET.fromstring(xml_text)
        pasted_root_id = str(paste_body.get("pasted_root_element_id") or "")
        pasted_subprocess = next(
            (el for el in _iter_local(root, "subProcess") if str(el.attrib.get("id") or "").strip() == pasted_root_id),
            None,
        )
        self.assertIsNotNone(pasted_subprocess)

        pasted_property = next(
            (el for el in list(pasted_subprocess) if _local(el.tag) == "property" and str(el.attrib.get("name") or "") == "__targetRef_placeholder"),
            None,
        )
        self.assertIsNotNone(pasted_property)
        pasted_property_id = str(pasted_property.attrib.get("id") or "")
        self.assertTrue(pasted_property_id)
        self.assertNotEqual(pasted_property_id, "Property_placeholder_1")

        pasted_input_association = next(
            (el for el in list(pasted_subprocess) if _local(el.tag) == "dataInputAssociation"),
            None,
        )
        self.assertIsNotNone(pasted_input_association)
        self.assertNotEqual(str(pasted_input_association.attrib.get("id") or ""), "DataInputAssociation_placeholder_1")
        pasted_target_ref = next((el for el in _iter_local(pasted_input_association, "targetRef")), None)
        pasted_source_ref = next((el for el in _iter_local(pasted_input_association, "sourceRef")), None)
        self.assertIsNotNone(pasted_target_ref)
        self.assertEqual(str("".join(pasted_target_ref.itertext()) or "").strip(), pasted_property_id)
        self.assertIsNotNone(pasted_source_ref)
        remapped_source_ref = str("".join(pasted_source_ref.itertext()) or "").strip()
        self.assertNotEqual(remapped_source_ref, "NestedTask_1")
        self.assertTrue(any(str(el.attrib.get("id") or "").strip() == remapped_source_ref for el in pasted_subprocess.iter()))
        self.assertIn(pasted_property_id, xml_text)
        self.assertNotIn('id="Property_placeholder_1"', xml_text)
        self.assertNotIn(">Property_placeholder_1<", xml_text)

    def test_external_datastore_dependency_is_captured_in_payload(self):
        source_session_id = self._create_session_with_xml(
            title="External auxiliary ref subprocess",
            xml=EXTERNAL_AUXILIARY_REF_SUBPROCESS_XML,
        )
        sess = self.get_storage().load(source_session_id, org_id=self.org_id, is_admin=True)
        payload = self.serialize_clipboard_payload(
            session_obj=sess,
            element_id="SubProcess_ExternalAux_1",
            copied_by_user_id=str(self.owner.get("id") or ""),
            copied_at=1730003456,
            source_org_id=self.org_id,
        )
        self.assertIsInstance(payload, self.ClipboardSubprocessPayload)
        self.assertEqual(payload.root.old_id, "SubProcess_ExternalAux_1")
        self.assertEqual({node.old_id for node in payload.fragment.nodes}, {"ExternalAuxStart_1", "ExternalAuxTask_1", "ExternalAuxThrow_1"})
        self.assertEqual(len(list(payload.external_dependencies or [])), 1)
        datastore_dependency = payload.external_dependencies[0]
        self.assertEqual(datastore_dependency.old_id, "DataStoreReference_External")
        self.assertEqual(datastore_dependency.element_type, "dataStoreReference")
        self.assertEqual(str(datastore_dependency.name or ""), "Shared closure source")
        self.assertIsNotNone(datastore_dependency.di_bounds)
        self.assertNotIn("DataStoreReference_External", {node.old_id for node in payload.fragment.nodes})
        input_association = next(
            child for child in list(payload.root.extra_children or [])
            if str(child.get("type") or "") == "dataInputAssociation"
        )
        source_ref = next(
            child for child in list(input_association.get("children") or [])
            if str(child.get("type") or "") == "sourceRef"
        )
        self.assertEqual(str(source_ref.get("text") or ""), "DataStoreReference_External")

    def test_external_datastore_dependency_roundtrip_creates_remapped_datastore_and_refs(self):
        source_session_id = self._create_session_with_xml(
            title="External auxiliary ref subprocess",
            xml=EXTERNAL_AUXILIARY_REF_SUBPROCESS_XML,
        )
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            copy_out = self.copy_bpmn_element_to_clipboard(
                self.ClipboardCopyIn(session_id=source_session_id, element_id="SubProcess_ExternalAux_1"),
                self._req(self.owner),
            )
            copy_status, copy_body = _read_response(copy_out)
            self.assertEqual(copy_status, 200)
            self.assertEqual(str(copy_body.get("clipboard_item_type") or ""), "bpmn_subprocess_subtree")

            preview_out = self.get_current_bpmn_clipboard(self._req(self.owner))
            preview_status, preview_body = _read_response(preview_out)
            self.assertEqual(preview_status, 200)
            self.assertEqual(bool(preview_body.get("empty")), False)
            self.assertEqual(str((preview_body.get("item") or {}).get("element_type") or ""), "subProcess")

            paste_out = self.paste_bpmn_clipboard(
                self.ClipboardPasteIn(session_id=self.target_session_id),
                self._req(self.owner),
            )
            paste_status, paste_body = _read_response(paste_out)
            self.assertEqual(paste_status, 200)
            self.assertTrue(bool(paste_body.get("ok")))
            self.assertEqual(len(set(paste_body.get("created_node_ids") or [])), 5)
            self.assertEqual(len(set(paste_body.get("created_edge_ids") or [])), 2)

        reloaded = self.get_storage().load(self.target_session_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(reloaded)
        xml_text = str(getattr(reloaded, "bpmn_xml", "") or "")
        root = ET.fromstring(xml_text)
        pasted_root_id = str(paste_body.get("pasted_root_element_id") or "")
        pasted_subprocess = next(
            (el for el in _iter_local(root, "subProcess") if str(el.attrib.get("id") or "").strip() == pasted_root_id),
            None,
        )
        self.assertIsNotNone(pasted_subprocess)

        pasted_datastore = next((el for el in list(pasted_subprocess) if _local(el.tag) == "dataStoreReference"), None)
        self.assertIsNotNone(pasted_datastore)
        pasted_datastore_id = str(pasted_datastore.attrib.get("id") or "")
        self.assertTrue(pasted_datastore_id)
        self.assertNotEqual(pasted_datastore_id, "DataStoreReference_External")

        pasted_property = next((el for el in list(pasted_subprocess) if _local(el.tag) == "property"), None)
        self.assertIsNotNone(pasted_property)
        pasted_property_id = str(pasted_property.attrib.get("id") or "")
        self.assertTrue(pasted_property_id)
        self.assertNotEqual(pasted_property_id, "Property_external_aux_1")

        pasted_input_association = next(
            (el for el in list(pasted_subprocess) if _local(el.tag) == "dataInputAssociation"),
            None,
        )
        self.assertIsNotNone(pasted_input_association)
        pasted_source_ref = next((el for el in _iter_local(pasted_input_association, "sourceRef")), None)
        pasted_target_ref = next((el for el in _iter_local(pasted_input_association, "targetRef")), None)
        self.assertIsNotNone(pasted_source_ref)
        self.assertIsNotNone(pasted_target_ref)
        self.assertEqual(str("".join(pasted_source_ref.itertext()) or "").strip(), pasted_datastore_id)
        self.assertEqual(str("".join(pasted_target_ref.itertext()) or "").strip(), pasted_property_id)
        self.assertIn(pasted_datastore_id, set(paste_body.get("created_node_ids") or []))
        self.assertNotIn('id="DataStoreReference_External"', xml_text)

        second_reload = self.get_storage().load(self.target_session_id, org_id=self.org_id, is_admin=True)
        self.assertIn(pasted_datastore_id, str(getattr(second_reload, "bpmn_xml", "") or ""))

    def test_external_non_datastore_auxiliary_ref_still_rejects(self):
        source_session_id = self._create_session_with_xml(
            title="External task auxiliary ref subprocess",
            xml=EXTERNAL_NON_DATASTORE_AUXILIARY_REF_SUBPROCESS_XML,
        )
        sess = self.get_storage().load(source_session_id, org_id=self.org_id, is_admin=True)
        with self.assertRaises(self.ClipboardSerializationError) as ctx:
            self.serialize_clipboard_payload(
                session_obj=sess,
                element_id="SubProcess_ExternalAuxTask_1",
                copied_by_user_id=str(self.owner.get("id") or ""),
                copied_at=1730003555,
                source_org_id=self.org_id,
            )
        exc = ctx.exception
        self.assertEqual(exc.code, "external_auxiliary_ref_outside_subtree")
        self.assertIn("ExternalTask_1", str(exc.message))

    def test_inline_datastore_subprocess_roundtrip_remaps_datastore_and_association_refs(self):
        source_session_id = self._create_session_with_xml(
            title="Inline datastore subprocess",
            xml=INLINE_DATASTORE_SUBPROCESS_XML,
        )
        sess = self.get_storage().load(source_session_id, org_id=self.org_id, is_admin=True)
        payload = self.serialize_clipboard_payload(
            session_obj=sess,
            element_id="StageLikeDataStoreSubProcess_1",
            copied_by_user_id=str(self.owner.get("id") or ""),
            copied_at=1730002345,
            source_org_id=self.org_id,
        )
        self.assertIsInstance(payload, self.ClipboardSubprocessPayload)
        self.assertEqual(payload.root.old_id, "StageLikeDataStoreSubProcess_1")
        self.assertEqual(
            {node.old_id for node in payload.fragment.nodes},
            {
                "DataStoreReference_1",
                "StageDataStoreStart_1",
                "StageDataStoreTask_1",
                "StageDataStoreGateway_1",
                "StageDataStoreThrow_1",
                "StageDataStoreTask_2",
                "StageDataStoreEnd_1",
            },
        )
        datastore_payload = next(node for node in payload.fragment.nodes if node.old_id == "DataStoreReference_1")
        self.assertEqual(datastore_payload.element_type, "dataStoreReference")
        self.assertEqual(str(datastore_payload.name or ""), "Closure source")
        input_association = next(
            child for child in list(payload.root.extra_children or [])
            if str(child.get("type") or "") == "dataInputAssociation"
        )
        source_ref = next(
            child for child in list(input_association.get("children") or [])
            if str(child.get("type") or "") == "sourceRef"
        )
        target_ref = next(
            child for child in list(input_association.get("children") or [])
            if str(child.get("type") or "") == "targetRef"
        )
        self.assertEqual(str(source_ref.get("text") or ""), "DataStoreReference_1")
        self.assertEqual(str(target_ref.get("text") or ""), "Property_data_store_1")

        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            copy_out = self.copy_bpmn_element_to_clipboard(
                self.ClipboardCopyIn(session_id=source_session_id, element_id="StageLikeDataStoreSubProcess_1"),
                self._req(self.owner),
            )
            copy_status, copy_body = _read_response(copy_out)
            self.assertEqual(copy_status, 200)
            self.assertEqual(str(copy_body.get("clipboard_item_type") or ""), "bpmn_subprocess_subtree")

            preview_out = self.get_current_bpmn_clipboard(self._req(self.owner))
            preview_status, preview_body = _read_response(preview_out)
            self.assertEqual(preview_status, 200)
            self.assertEqual(bool(preview_body.get("empty")), False)

            paste_out = self.paste_bpmn_clipboard(
                self.ClipboardPasteIn(session_id=self.target_session_id),
                self._req(self.owner),
            )
            paste_status, paste_body = _read_response(paste_out)
            self.assertEqual(paste_status, 200)
            self.assertTrue(bool(paste_body.get("ok")))
            self.assertEqual(len(set(paste_body.get("created_node_ids") or [])), 8)
            self.assertEqual(len(set(paste_body.get("created_edge_ids") or [])), 5)

        reloaded = self.get_storage().load(self.target_session_id, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(reloaded)
        xml_text = str(getattr(reloaded, "bpmn_xml", "") or "")
        root = ET.fromstring(xml_text)
        pasted_root_id = str(paste_body.get("pasted_root_element_id") or "")
        pasted_subprocess = next(
            (el for el in _iter_local(root, "subProcess") if str(el.attrib.get("id") or "").strip() == pasted_root_id),
            None,
        )
        self.assertIsNotNone(pasted_subprocess)

        pasted_datastore = next((el for el in list(pasted_subprocess) if _local(el.tag) == "dataStoreReference"), None)
        self.assertIsNotNone(pasted_datastore)
        pasted_datastore_id = str(pasted_datastore.attrib.get("id") or "")
        self.assertTrue(pasted_datastore_id)
        self.assertNotEqual(pasted_datastore_id, "DataStoreReference_1")

        pasted_property = next((el for el in list(pasted_subprocess) if _local(el.tag) == "property"), None)
        self.assertIsNotNone(pasted_property)
        pasted_property_id = str(pasted_property.attrib.get("id") or "")
        self.assertTrue(pasted_property_id)
        self.assertNotEqual(pasted_property_id, "Property_data_store_1")

        pasted_input_association = next(
            (el for el in list(pasted_subprocess) if _local(el.tag) == "dataInputAssociation"),
            None,
        )
        self.assertIsNotNone(pasted_input_association)
        pasted_source_ref = next((el for el in _iter_local(pasted_input_association, "sourceRef")), None)
        pasted_target_ref = next((el for el in _iter_local(pasted_input_association, "targetRef")), None)
        self.assertIsNotNone(pasted_source_ref)
        self.assertIsNotNone(pasted_target_ref)
        self.assertEqual(str("".join(pasted_source_ref.itertext()) or "").strip(), pasted_datastore_id)
        self.assertEqual(str("".join(pasted_target_ref.itertext()) or "").strip(), pasted_property_id)
        self.assertIn(pasted_datastore_id, xml_text)
        self.assertNotIn('id="DataStoreReference_1"', xml_text)
        self.assertNotIn(">DataStoreReference_1<", xml_text)

    def test_unsupported_subprocess_topology_rejects_clearly(self):
        extra_project = self.create_project(self.CreateProjectIn(title="Unsupported Project"), self._req(self.owner))
        bad_session = self.create_project_session(
            str(extra_project.get("id") or ""),
            self.CreateSessionIn(title="Bad Session"),
            "quick_skeleton",
            request=self._req(self.owner),
        )
        bad_session_id = str(bad_session.get("id") or "")
        self.assertTrue(bool(self.session_bpmn_save(bad_session_id, self.BpmnXmlIn(xml=UNSUPPORTED_SUBPROCESS_XML), self._req(self.owner)).get("ok")))
        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            out = self.copy_bpmn_element_to_clipboard(
                self.ClipboardCopyIn(session_id=bad_session_id, element_id="SubProcess_Bad"),
                self._req(self.owner),
            )
        status, body = _read_response(out)
        self.assertEqual(status, 422)
        self.assertEqual(str(((body.get("error") or {}).get("code") or "")), "unsupported_subprocess_topology")

    def test_failed_copy_clears_stale_clipboard_item(self):
        extra_project = self.create_project(self.CreateProjectIn(title="Unsupported Project"), self._req(self.owner))
        bad_session = self.create_project_session(
            str(extra_project.get("id") or ""),
            self.CreateSessionIn(title="Bad Session"),
            "quick_skeleton",
            request=self._req(self.owner),
        )
        bad_session_id = str(bad_session.get("id") or "")
        self.assertTrue(bool(self.session_bpmn_save(bad_session_id, self.BpmnXmlIn(xml=UNSUPPORTED_SUBPROCESS_XML), self._req(self.owner)).get("ok")))

        fake = _FakeRedis()
        with patch("app.redis_cache.get_client", return_value=fake):
            good_copy_out = self.copy_bpmn_element_to_clipboard(
                self.ClipboardCopyIn(session_id=self.source_session_id, element_id="SubProcess_1"),
                self._req(self.owner),
            )
            good_copy_status, good_copy_body = _read_response(good_copy_out)
            self.assertEqual(good_copy_status, 200)
            self.assertEqual(str(good_copy_body.get("clipboard_item_type") or ""), "bpmn_subprocess_subtree")

            key = self.clipboard_key(user_id=str(self.owner.get("id") or ""), org_id=self.org_id)
            self.assertIsNotNone(fake.get(key))

            failed_copy_out = self.copy_bpmn_element_to_clipboard(
                self.ClipboardCopyIn(session_id=bad_session_id, element_id="SubProcess_Bad"),
                self._req(self.owner),
            )
            failed_copy_status, failed_copy_body = _read_response(failed_copy_out)
            self.assertEqual(failed_copy_status, 422)
            self.assertEqual(str(((failed_copy_body.get("error") or {}).get("code") or "")), "unsupported_subprocess_topology")
            self.assertIsNone(fake.get(key))

            preview_out = self.get_current_bpmn_clipboard(self._req(self.owner))
            preview_status, preview_body = _read_response(preview_out)
            self.assertEqual(preview_status, 200)
            self.assertEqual(bool(preview_body.get("empty")), True)
            self.assertIsNone(preview_body.get("item"))

            paste_out = self.paste_bpmn_clipboard(
                self.ClipboardPasteIn(session_id=self.target_session_id),
                self._req(self.owner),
            )
            paste_status, paste_body = _read_response(paste_out)
            self.assertEqual(paste_status, 404)
            self.assertEqual(str(((paste_body.get("error") or {}).get("code") or "")), "clipboard_empty")


if __name__ == "__main__":
    unittest.main()
