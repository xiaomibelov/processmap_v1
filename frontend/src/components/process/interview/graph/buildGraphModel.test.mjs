import test from "node:test";
import assert from "node:assert/strict";

import { buildInterviewGraphModel } from "./buildGraphModel.js";

const HAS_DOM_PARSER = typeof DOMParser !== "undefined";

function makeRank(nodeIds) {
  const out = {};
  nodeIds.forEach((id, idx) => {
    out[id] = idx;
  });
  return out;
}

function makeBpmnXml({ nodes = [], flows = [] }) {
  const nodeXml = nodes
    .map((node) => `<${node.type} id="${node.id}" name="${node.name || node.id}" />`)
    .join("");
  const flowXml = flows
    .map((flow) => `<sequenceFlow id="${flow.id}" sourceRef="${flow.sourceId}" targetRef="${flow.targetId}" name="${flow.name || ""}" />`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1">
    ${nodeXml}
    ${flowXml}
  </bpmn:process>
</bpmn:definitions>`;
}

test("buildInterviewGraphModel parses nodes/flows and labels", () => {
  const xml = makeBpmnXml({
    nodes: [
      { id: "S", type: "startEvent", name: "Start" },
      { id: "A", type: "task", name: "Task A" },
      { id: "E", type: "endEvent", name: "End" },
    ],
    flows: [
      { id: "F1", sourceId: "S", targetId: "A" },
      { id: "F2", sourceId: "A", targetId: "E", name: "default" },
    ],
  });
  const nodes = [
    { id: "S", title: "Start", bpmnKind: "startEvent" },
    { id: "A", title: "Task A", bpmnKind: "task" },
    { id: "E", title: "End", bpmnKind: "endEvent" },
  ];
  const edges = [
    { id: "F1", from_id: "S", to_id: "A" },
    { id: "F2", from_id: "A", to_id: "E" },
  ];
  const graph = buildInterviewGraphModel({
    bpmnXml: xml,
    backendNodes: nodes,
    backendEdges: edges,
    transitionLabelByKey: { A__E: "default" },
    nodeKindById: {},
    laneMetaByNode: {},
    subprocessMetaByNode: {},
    graphNodeRank: makeRank(["S", "A", "E"]),
  });

  assert.equal(Object.keys(graph.nodesById).length, 3);
  assert.equal(Object.keys(graph.flowsById).length, 2);
  assert.equal(graph.flowsById.F2.condition, "default");
  assert.deepEqual(graph.startNodeIds, ["S"]);
  assert.deepEqual(graph.endNodeIds, ["E"]);
  assert.equal(graph.flowSourceMode, HAS_DOM_PARSER ? "xml_sequence_flow" : "runtime_fallback");
});

test("buildInterviewGraphModel marks flow tier from flowMetaById", () => {
  const xml = makeBpmnXml({
    nodes: [
      { id: "S", type: "startEvent", name: "Start" },
      { id: "G", type: "exclusiveGateway", name: "Decision" },
      { id: "A", type: "task", name: "A" },
      { id: "B", type: "task", name: "B" },
      { id: "E", type: "endEvent", name: "End" },
    ],
    flows: [
      { id: "F1", sourceId: "S", targetId: "G" },
      { id: "F2", sourceId: "G", targetId: "A", name: "Да" },
      { id: "F3", sourceId: "G", targetId: "B", name: "Нет" },
      { id: "F4", sourceId: "A", targetId: "E" },
      { id: "F5", sourceId: "B", targetId: "E" },
    ],
  });
  const graph = buildInterviewGraphModel({
    bpmnXml: xml,
    backendNodes: [
      { id: "S", title: "Start", bpmnKind: "startEvent" },
      { id: "G", title: "Decision", bpmnKind: "exclusiveGateway" },
      { id: "A", title: "A", bpmnKind: "task" },
      { id: "B", title: "B", bpmnKind: "task" },
      { id: "E", title: "End", bpmnKind: "endEvent" },
    ],
    backendEdges: [],
    transitionLabelByKey: {},
    flowMetaById: { F2: { tier: "P1", rtier: "R1" } },
    nodeKindById: {},
    laneMetaByNode: {},
    subprocessMetaByNode: {},
    graphNodeRank: makeRank(["S", "G", "A", "B", "E"]),
  });

  if (HAS_DOM_PARSER) {
    assert.equal(graph.flowsById.F2?.tier, "P1");
    assert.equal(graph.flowsById.F2?.rtier, "R1");
    assert.equal(
      graph.gatewayById.G?.splitBranches?.find((b) => b.flowId === "F2")?.tier,
      "P1",
    );
    assert.equal(
      graph.gatewayById.G?.splitBranches?.find((b) => b.flowId === "F2")?.rtier,
      "R1",
    );
  }
});

test("buildInterviewGraphModel marks detached nodes as non-reachable", () => {
  const xml = makeBpmnXml({
    nodes: [
      { id: "S", type: "startEvent" },
      { id: "A", type: "task" },
      { id: "E", type: "endEvent" },
      { id: "X", type: "task" },
    ],
    flows: [
      { id: "F1", sourceId: "S", targetId: "A" },
      { id: "F2", sourceId: "A", targetId: "E" },
    ],
  });
  const nodes = [
    { id: "S", title: "Start", bpmnKind: "startEvent" },
    { id: "A", title: "Task A", bpmnKind: "task" },
    { id: "E", title: "End", bpmnKind: "endEvent" },
    { id: "X", title: "Detached", bpmnKind: "task" },
  ];
  const edges = [
    { id: "F1", from_id: "S", to_id: "A" },
    { id: "F2", from_id: "A", to_id: "E" },
  ];
  const graph = buildInterviewGraphModel({
    bpmnXml: xml,
    backendNodes: nodes,
    backendEdges: edges,
    transitionLabelByKey: {},
    nodeKindById: {},
    laneMetaByNode: {},
    subprocessMetaByNode: {},
    graphNodeRank: makeRank(["S", "A", "E", "X"]),
  });
  const reachable = new Set(graph.reachableNodeIds);
  assert.equal(reachable.has("S"), true);
  assert.equal(reachable.has("A"), true);
  assert.equal(reachable.has("E"), true);
  assert.equal(reachable.has("X"), false);
});

test("buildInterviewGraphModel detects split/join for xor and parallel gateways", () => {
  const xml = makeBpmnXml({
    nodes: [
      { id: "S", type: "startEvent" },
      { id: "GX", type: "exclusiveGateway" },
      { id: "XA", type: "task" },
      { id: "XB", type: "task" },
      { id: "JX", type: "exclusiveGateway" },
      { id: "GP", type: "parallelGateway" },
      { id: "PA", type: "task" },
      { id: "PB", type: "task" },
      { id: "JP", type: "parallelGateway" },
      { id: "E", type: "endEvent" },
    ],
    flows: [
      { id: "F1", sourceId: "S", targetId: "GX" },
      { id: "F2", sourceId: "GX", targetId: "XA", name: "Да" },
      { id: "F3", sourceId: "GX", targetId: "XB", name: "Нет" },
      { id: "F4", sourceId: "XA", targetId: "JX" },
      { id: "F5", sourceId: "XB", targetId: "JX" },
      { id: "F6", sourceId: "JX", targetId: "GP" },
      { id: "F7", sourceId: "GP", targetId: "PA" },
      { id: "F8", sourceId: "GP", targetId: "PB" },
      { id: "F9", sourceId: "PA", targetId: "JP" },
      { id: "F10", sourceId: "PB", targetId: "JP" },
      { id: "F11", sourceId: "JP", targetId: "E" },
    ],
  });
  const nodes = [
    { id: "S", title: "Start", bpmnKind: "startEvent" },
    { id: "GX", title: "Xor split", bpmnKind: "exclusiveGateway" },
    { id: "XA", title: "Xor A", bpmnKind: "task" },
    { id: "XB", title: "Xor B", bpmnKind: "task" },
    { id: "JX", title: "Xor join", bpmnKind: "exclusiveGateway" },
    { id: "GP", title: "Parallel split", bpmnKind: "parallelGateway" },
    { id: "PA", title: "Parallel A", bpmnKind: "task" },
    { id: "PB", title: "Parallel B", bpmnKind: "task" },
    { id: "JP", title: "Parallel join", bpmnKind: "parallelGateway" },
    { id: "E", title: "End", bpmnKind: "endEvent" },
  ];
  const edges = [
    { from_id: "S", to_id: "GX" },
    { from_id: "GX", to_id: "XA" },
    { from_id: "GX", to_id: "XB" },
    { from_id: "XA", to_id: "JX" },
    { from_id: "XB", to_id: "JX" },
    { from_id: "JX", to_id: "GP" },
    { from_id: "GP", to_id: "PA" },
    { from_id: "GP", to_id: "PB" },
    { from_id: "PA", to_id: "JP" },
    { from_id: "PB", to_id: "JP" },
    { from_id: "JP", to_id: "E" },
  ];
  const graph = buildInterviewGraphModel({
    bpmnXml: xml,
    backendNodes: nodes,
    backendEdges: edges,
    transitionLabelByKey: { GX__XA: "Да", GX__XB: "Нет" },
    nodeKindById: {},
    laneMetaByNode: {},
    subprocessMetaByNode: {},
    graphNodeRank: makeRank(["S", "GX", "XA", "XB", "JX", "GP", "PA", "PB", "JP", "E"]),
  });

  assert.equal(graph.gatewayById.GX.mode, "xor");
  assert.equal(graph.gatewayById.GX.isSplit, true);
  assert.equal(graph.gatewayById.JX.isJoin, true);

  assert.equal(graph.gatewayById.GP.mode, "parallel");
  assert.equal(graph.gatewayById.GP.isSplit, true);
  assert.equal(graph.gatewayById.JP.isJoin, true);
});

test("buildInterviewGraphModel uses XML sequence flows as primary source over runtime edges", () => {
  const xml = makeBpmnXml({
    nodes: [
      { id: "S", type: "startEvent" },
      { id: "A", type: "task" },
      { id: "B", type: "task" },
      { id: "E", type: "endEvent" },
    ],
    flows: [
      { id: "X1", sourceId: "S", targetId: "A" },
      { id: "X2", sourceId: "A", targetId: "E" },
    ],
  });
  const graph = buildInterviewGraphModel({
    bpmnXml: xml,
    backendNodes: [
      { id: "S", title: "Start", bpmnKind: "startEvent" },
      { id: "A", title: "A", bpmnKind: "task" },
      { id: "B", title: "B", bpmnKind: "task" },
      { id: "E", title: "End", bpmnKind: "endEvent" },
    ],
    backendEdges: [
      { id: "R1", from_id: "S", to_id: "B" },
      { id: "R2", from_id: "B", to_id: "E" },
    ],
    transitionLabelByKey: {},
    nodeKindById: {},
    laneMetaByNode: {},
    subprocessMetaByNode: {},
    graphNodeRank: makeRank(["S", "A", "B", "E"]),
  });

  assert.equal(graph.flowSourceMode, HAS_DOM_PARSER ? "xml_sequence_flow" : "runtime_fallback");
  if (HAS_DOM_PARSER) {
    assert.equal(!!graph.flowsById.X1, true);
    assert.equal(!!graph.flowsById.X2, true);
    assert.equal(!!graph.flowsById.R1, false);
    assert.equal(!!graph.flowsById.R2, false);
  } else {
    assert.equal(!!graph.flowsById.R1, true);
    assert.equal(!!graph.flowsById.R2, true);
  }
});

test("buildInterviewGraphModel uses pseudo-start nodes when StartEvent is absent", () => {
  const nodes = Array.from({ length: 12 }, (_, idx) => ({
    id: `N${idx + 1}`,
    title: `Node ${idx + 1}`,
    bpmnKind: "task",
  }));
  const edges = [
    { from_id: "N1", to_id: "N2" },
    { from_id: "N2", to_id: "N3" },
  ];
  const graph = buildInterviewGraphModel({
    bpmnXml: "",
    backendNodes: nodes,
    backendEdges: edges,
    transitionLabelByKey: {},
    nodeKindById: {},
    laneMetaByNode: {},
    subprocessMetaByNode: {},
    graphNodeRank: makeRank(nodes.map((n) => n.id)),
  });
  assert.equal(graph.flowSourceMode, "runtime_fallback");
  assert.equal(graph.reachableSeedMode, "pseudo_start_incoming_zero");
  assert.equal(graph.fallbackStartNodeIds.includes("N1"), true);
  assert.equal(graph.reachableNodeIds.includes("N1"), true);
  assert.equal(graph.reachableNodeIds.includes("N2"), true);
  assert.equal(graph.reachableNodeIds.includes("N3"), true);
  assert.equal(graph.reachableNodeIds.includes("N4"), true);
});

test("buildInterviewGraphModel extracts explicit outcome hints from XML and backend parameters", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
  <bpmn:process id="Process_1">
    <bpmn:startEvent id="Start_1" name="Start" />
    <bpmn:endEvent id="End_By_Attr" name="Ошибка" outcome="success" />
    <bpmn:endEvent id="End_By_Ext" name="Завершение">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="result" value="fail" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:endEvent>
    <bpmn:endEvent id="End_By_Backend" name="Unknown" />
    <bpmn:sequenceFlow id="F1" sourceRef="Start_1" targetRef="End_By_Attr" />
    <bpmn:sequenceFlow id="F2" sourceRef="Start_1" targetRef="End_By_Ext" />
    <bpmn:sequenceFlow id="F3" sourceRef="Start_1" targetRef="End_By_Backend" />
  </bpmn:process>
</bpmn:definitions>`;

  const graph = buildInterviewGraphModel({
    bpmnXml: xml,
    backendNodes: [
      { id: "Start_1", title: "Start", bpmnKind: "startEvent" },
      { id: "End_By_Attr", title: "Ошибка", bpmnKind: "endEvent" },
      { id: "End_By_Ext", title: "Завершение", bpmnKind: "endEvent" },
      { id: "End_By_Backend", title: "Unknown", bpmnKind: "endEvent", parameters: { outcome: "success" } },
    ],
    backendEdges: [],
    transitionLabelByKey: {},
    nodeKindById: {},
    laneMetaByNode: {},
    subprocessMetaByNode: {},
    graphNodeRank: makeRank(["Start_1", "End_By_Attr", "End_By_Ext", "End_By_Backend"]),
  });

  if (HAS_DOM_PARSER) {
    assert.equal(graph.nodesById.End_By_Attr?.outcomeHint, "success");
    assert.equal(graph.nodesById.End_By_Ext?.outcomeHint, "fail");
    assert.equal(graph.nodesById.End_By_Backend?.outcomeHint, "success");
  }
});
