import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { buildManualSaveProjectionSyncPlan } from "./manualSaveProjectionSync.js";
import {
  asArray,
  asObject,
  interviewHasContent,
  mergeInterviewData,
  sanitizeGraphNodes,
  mergeNodesById,
  mergeEdgesByKey,
  enrichInterviewWithNodeBindings,
  parseBpmnToSessionGraph,
} from "../../lib/processStageDomain.js";

const projectionHelpers = {
  asArray,
  asObject,
  interviewHasContent,
  mergeInterviewData,
  sanitizeGraphNodes,
  mergeNodesById,
  mergeEdgesByKey,
  enrichInterviewWithNodeBindings,
  parseBpmnToSessionGraph,
};

function withDom(run) {
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevDOMParser = globalThis.DOMParser;
  const prevXMLSerializer = globalThis.XMLSerializer;
  const prevNode = globalThis.Node;
  const prevElement = globalThis.Element;
  const prevHTMLElement = globalThis.HTMLElement;
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.XMLSerializer = dom.window.XMLSerializer;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  try {
    return run();
  } finally {
    globalThis.window = prevWindow;
    globalThis.document = prevDocument;
    globalThis.DOMParser = prevDOMParser;
    globalThis.XMLSerializer = prevXMLSerializer;
    globalThis.Node = prevNode;
    globalThis.Element = prevElement;
    globalThis.HTMLElement = prevHTMLElement;
  }
}

function baseXml(taskName = "Task_1") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="Trace" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_1" name="${taskName}">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="170" y="170" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="290" y="148" width="170" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="560" y="170" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="206" y="188" /><di:waypoint x="290" y="188" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="460" y="188" /><di:waypoint x="560" y="188" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

const extendedXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="Trace" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_1" name="Task_1">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:task id="Activity_new" name="A1_new_task">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_1" targetRef="Activity_new" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="170" y="170" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="290" y="148" width="170" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_new_di" bpmnElement="Activity_new"><dc:Bounds x="490" y="108" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="560" y="170" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="206" y="188" /><di:waypoint x="290" y="188" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="460" y="188" /><di:waypoint x="560" y="188" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3"><di:waypoint x="460" y="188" /><di:waypoint x="490" y="148" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

test("manual save projection sync builds nodes patch for graph-changing BPMN save", () => withDom(() => {
  const plan = buildManualSaveProjectionSyncPlan({
    xmlText: extendedXml,
    draft: {
      bpmn_xml: baseXml(),
      interview: {},
      nodes: [],
      edges: [],
    },
    projectionHelpers,
  });
  assert.equal(plan.ok, true);
  assert.equal(Array.isArray(plan.nextNodes), true);
  assert.equal(Array.isArray(plan.patch.nodes), true);
  assert.equal(plan.nextNodes.some((row) => String(row?.id || "") === "Activity_new"), true);
}));

test("manual save projection sync builds nodes patch for property rename path", () => withDom(() => {
  const plan = buildManualSaveProjectionSyncPlan({
    xmlText: baseXml("A4_renamed_task"),
    draft: {
      bpmn_xml: baseXml("Task_1"),
      interview: {},
      nodes: [
        { id: "Task_1", title: "Task_1", type: "step" },
      ],
      edges: [],
    },
    projectionHelpers,
  });
  assert.equal(plan.ok, true);
  assert.equal(Array.isArray(plan.patch.nodes), true);
  assert.equal(plan.patch.nodes.some((row) => String(row?.title || "") === "A4_renamed_task"), true);
}));

test("manual save projection sync returns empty patch when projection already matches durable BPMN", () => withDom(() => {
  const xml = baseXml("Task_1");
  const first = buildManualSaveProjectionSyncPlan({
    xmlText: xml,
    draft: {
      bpmn_xml: xml,
      interview: {},
      nodes: [],
      edges: [],
    },
    projectionHelpers,
  });
  const second = buildManualSaveProjectionSyncPlan({
    xmlText: xml,
    draft: {
      bpmn_xml: xml,
      interview: first.nextInterview,
      nodes: first.nextNodes,
      edges: first.nextEdges,
    },
    projectionHelpers,
  });
  assert.equal(second.ok, true);
  assert.deepEqual(second.patch, {});
}));
