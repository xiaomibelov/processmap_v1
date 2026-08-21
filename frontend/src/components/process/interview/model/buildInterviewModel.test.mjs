import test from "node:test";
import assert from "node:assert/strict";

import { buildInterviewGraphModel } from "../graph/buildGraphModel.js";
import { buildInterviewModel } from "./buildInterviewModel.js";

function makeGraphNodeRank(nodeIds) {
  const out = {};
  nodeIds.forEach((id, idx) => {
    out[id] = idx;
  });
  return out;
}

function makeNodeMetaById(nodes) {
  const out = {};
  nodes.forEach((node) => {
    out[node.id] = {
      title: node.title,
      lane: node.actorRole || "",
      kind: node.bpmnKind || "",
    };
  });
  return out;
}

function makeTimelineBaseView(nodeIds, kindById) {
  return nodeIds.map((nodeId, idx) => ({
    id: `step_${idx + 1}`,
    seq: idx + 1,
    seq_label: String(idx + 1),
    action: nodeId,
    node_bind_id: nodeId,
    node_bind_title: nodeId,
    node_bind_kind: String(kindById[nodeId] || "").toLowerCase(),
    lane_name: "L1",
    node_bound: true,
  }));
}

test("buildInterviewGraphModel: detects gateway split/join and split branches", () => {
  const backendNodes = [
    { id: "S", title: "Start", bpmnKind: "startEvent" },
    { id: "G", title: "Check", bpmnKind: "exclusiveGateway" },
    { id: "A", title: "Yes path", bpmnKind: "task" },
    { id: "B", title: "No path", bpmnKind: "task" },
    { id: "J", title: "Join", bpmnKind: "exclusiveGateway" },
    { id: "E", title: "End", bpmnKind: "endEvent" },
  ];
  const backendEdges = [
    { from_id: "S", to_id: "G" },
    { from_id: "G", to_id: "A" },
    { from_id: "G", to_id: "B" },
    { from_id: "A", to_id: "J" },
    { from_id: "B", to_id: "J" },
    { from_id: "J", to_id: "E" },
  ];
  const transitionLabelByKey = {
    G__A: "Да",
    G__B: "Нет",
  };
  const graphNodeRank = makeGraphNodeRank(["S", "G", "A", "B", "J", "E"]);
  const graph = buildInterviewGraphModel({
    backendNodes,
    backendEdges,
    transitionLabelByKey,
    nodeKindById: {},
    laneMetaByNode: {},
    subprocessMetaByNode: {},
    graphNodeRank,
  });

  assert.equal(graph.gatewayById.G.isSplit, true);
  assert.equal(graph.gatewayById.G.mode, "xor");
  assert.equal(graph.gatewayById.G.splitBranches.length, 2);
  assert.equal(graph.gatewayById.G.joinNodeId, "J");
  assert.equal(graph.gatewayById.J.isJoin, true);
});

test("buildInterviewModel: inserts between-branches block and keeps non-primary as real branch steps", () => {
  const backendNodes = [
    { id: "S", title: "Start", bpmnKind: "startEvent" },
    { id: "G", title: "Delivery button?", bpmnKind: "exclusiveGateway" },
    { id: "A", title: "Open freezer", bpmnKind: "task" },
    { id: "B", title: "Retry start", bpmnKind: "task" },
    { id: "J", title: "Merge", bpmnKind: "exclusiveGateway" },
    { id: "E", title: "End", bpmnKind: "endEvent" },
  ];
  const backendEdges = [
    { from_id: "S", to_id: "G" },
    { from_id: "G", to_id: "A" },
    { from_id: "G", to_id: "B" },
    { from_id: "A", to_id: "J" },
    { from_id: "B", to_id: "J" },
    { from_id: "J", to_id: "E" },
  ];
  const transitionLabelByKey = {
    G__A: "Да",
    G__B: "Нет",
  };
  const nodeOrder = ["S", "G", "A", "B", "J", "E"];
  const graphNodeRank = makeGraphNodeRank(nodeOrder);
  const graph = buildInterviewGraphModel({
    backendNodes,
    backendEdges,
    transitionLabelByKey,
    nodeKindById: {},
    laneMetaByNode: {},
    subprocessMetaByNode: {},
    graphNodeRank,
  });
  const kindById = {
    S: "startEvent",
    G: "exclusiveGateway",
    A: "task",
    B: "task",
    J: "exclusiveGateway",
    E: "endEvent",
  };
  const model = buildInterviewModel({
    timelineBaseView: makeTimelineBaseView(nodeOrder, kindById),
    graph,
    nodeMetaById: makeNodeMetaById(backendNodes),
    graphOrderLocked: true,
    graphNodeRank,
  });

  const stepG = model.timelineView.find((step) => step.node_bind_id === "G");
  assert.ok(stepG?.between_branches_item);
  const between = stepG.between_branches_item;
  assert.equal(toTextSafe(between.fromGraphNo), "2");
  assert.equal(toTextSafe(between.toGraphNo), "3");
  assert.equal(between.branches.length, 2);
  between.branches.forEach((branch) => {
    assert.ok(typeof branch.stopReason === "string");
    assert.ok(branch.stopReason.length > 0);
  });

  const noBranch = between.branches.find((branch) => String(branch?.label || "").toLowerCase() === "нет");
  assert.ok(noBranch);
  assert.ok(noBranch.children.some((node) => node.kind === "step" && node.nodeId === "B"));
  assert.equal(noBranch.children.some((node) => node.kind === "continue"), false);
});

test("buildInterviewModel: marks loop-back in non-primary branch", () => {
  const backendNodes = [
    { id: "S", title: "Start", bpmnKind: "startEvent" },
    { id: "M5", title: "Press Start", bpmnKind: "task" },
    { id: "G6", title: "Button appeared?", bpmnKind: "exclusiveGateway" },
    { id: "M7", title: "Open freezer", bpmnKind: "task" },
    { id: "R1", title: "Retry", bpmnKind: "task" },
    { id: "E", title: "End", bpmnKind: "endEvent" },
  ];
  const backendEdges = [
    { from_id: "S", to_id: "M5" },
    { from_id: "M5", to_id: "G6" },
    { from_id: "G6", to_id: "M7" },
    { from_id: "G6", to_id: "R1" },
    { from_id: "R1", to_id: "G6" },
    { from_id: "M7", to_id: "E" },
  ];
  const transitionLabelByKey = {
    G6__M7: "Да",
    G6__R1: "Нет",
  };
  const nodeOrder = ["S", "M5", "G6", "M7", "R1", "E"];
  const graphNodeRank = makeGraphNodeRank(nodeOrder);
  const graph = buildInterviewGraphModel({
    backendNodes,
    backendEdges,
    transitionLabelByKey,
    nodeKindById: {},
    laneMetaByNode: {},
    subprocessMetaByNode: {},
    graphNodeRank,
  });
  const kindById = {
    S: "startEvent",
    M5: "task",
    G6: "exclusiveGateway",
    M7: "task",
    R1: "task",
    E: "endEvent",
  };
  const model = buildInterviewModel({
    timelineBaseView: makeTimelineBaseView(nodeOrder, kindById),
    graph,
    nodeMetaById: makeNodeMetaById(backendNodes),
    graphOrderLocked: true,
    graphNodeRank,
  });

  const stepG6 = model.timelineView.find((step) => step.node_bind_id === "G6");
  const noBranch = toArraySafe(stepG6?.between_branches_item?.branches).find(
    (branch) => String(branch?.label || "").toLowerCase() === "нет",
  );
  assert.ok(noBranch);
  assert.ok(noBranch.children.some((node) => node.kind === "step" && node.nodeId === "R1"));
  assert.ok(noBranch.children.some((node) => node.kind === "loop" && node.targetNodeId === "G6"));
});

test("buildInterviewModel: builds between-branches block for parallel split", () => {
  const backendNodes = [
    { id: "S", title: "Start", bpmnKind: "startEvent" },
    { id: "PG", title: "Parallel split", bpmnKind: "parallelGateway" },
    { id: "P1", title: "Branch A", bpmnKind: "task" },
    { id: "P2", title: "Branch B", bpmnKind: "task" },
    { id: "PJ", title: "Parallel join", bpmnKind: "parallelGateway" },
    { id: "N", title: "Next mainline", bpmnKind: "task" },
    { id: "E", title: "End", bpmnKind: "endEvent" },
  ];
  const backendEdges = [
    { from_id: "S", to_id: "PG" },
    { from_id: "PG", to_id: "P1" },
    { from_id: "PG", to_id: "P2" },
    { from_id: "P1", to_id: "PJ" },
    { from_id: "P2", to_id: "PJ" },
    { from_id: "PJ", to_id: "N" },
    { from_id: "N", to_id: "E" },
  ];
  const graphNodeRank = makeGraphNodeRank(["S", "PG", "P1", "P2", "PJ", "N", "E"]);
  const graph = buildInterviewGraphModel({
    backendNodes,
    backendEdges,
    transitionLabelByKey: {},
    nodeKindById: {},
    laneMetaByNode: {},
    subprocessMetaByNode: {},
    graphNodeRank,
  });
  const kindById = {
    S: "startEvent",
    PG: "parallelGateway",
    P1: "task",
    P2: "task",
    PJ: "parallelGateway",
    N: "task",
    E: "endEvent",
  };
  const model = buildInterviewModel({
    timelineBaseView: makeTimelineBaseView(["S", "PG", "P1", "P2", "PJ", "N", "E"], kindById),
    graph,
    nodeMetaById: makeNodeMetaById(backendNodes),
    graphOrderLocked: true,
    graphNodeRank,
  });

  const stepPG = model.timelineView.find((step) => step.node_bind_id === "PG");
  assert.equal(stepPG?.gateway_mode, "parallel");
  assert.ok(stepPG?.between_branches_item);
  assert.equal(toArraySafe(stepPG?.between_branches_item?.branches).length, 2);
  assert.deepEqual(model.mainlineNodeIds, ["S", "PG", "PJ", "N", "E"]);
});

test("buildInterviewModel: mainline picks gateway default flow as primary", () => {
  const nodeOrder = ["S", "G", "A", "B", "E"];
  const graphNodeRank = makeGraphNodeRank(nodeOrder);
  const model = buildInterviewModel({
    timelineBaseView: makeTimelineBaseView(nodeOrder, {
      S: "startEvent",
      G: "exclusiveGateway",
      A: "task",
      B: "task",
      E: "endEvent",
    }),
    graph: {
      nodesById: {
        S: { id: "S", type: "startevent", name: "Start" },
        G: { id: "G", type: "exclusivegateway", name: "Decision", defaultFlowId: "F_G_B" },
        A: { id: "A", type: "task", name: "Path A" },
        B: { id: "B", type: "task", name: "Path B" },
        E: { id: "E", type: "endevent", name: "End" },
      },
      outgoingByNode: {
        S: [{ id: "F_S_G", targetId: "G" }],
        G: [{ id: "F_G_A", targetId: "A" }, { id: "F_G_B", targetId: "B" }],
        A: [{ id: "F_A_E", targetId: "E" }],
        B: [{ id: "F_B_E", targetId: "E" }],
        E: [],
      },
      incomingByNode: {},
      gatewayById: {
        G: {
          id: "G",
          type: "exclusivegateway",
          mode: "xor",
          defaultFlowId: "F_G_B",
          isSplit: true,
          isJoin: false,
          splitBranches: [
            { flowId: "F_G_A", targetId: "A", condition: "Да" },
            { flowId: "F_G_B", targetId: "B", condition: "Нет" },
          ],
          joinNodeId: "",
        },
      },
      endNodeIds: ["E"],
      reachableNodeIds: nodeOrder,
    },
    nodeMetaById: makeNodeMetaById([
      { id: "S", title: "Start", bpmnKind: "startEvent" },
      { id: "G", title: "Decision", bpmnKind: "exclusiveGateway" },
      { id: "A", title: "Path A", bpmnKind: "task" },
      { id: "B", title: "Path B", bpmnKind: "task" },
      { id: "E", title: "End", bpmnKind: "endEvent" },
    ]),
    graphOrderLocked: true,
    graphNodeRank,
  });

  assert.deepEqual(model.mainlineNodeIds, ["S", "G", "B", "E"]);
  const gStep = model.timelineView.find((row) => row.node_bind_id === "G");
  const primary = toArraySafe(gStep?.gateway_branch_previews).find((branch) => !!branch?.isPrimary);
  assert.equal(toTextSafe(primary?.flowId), "F_G_B");
});

test("buildInterviewModel: tier P0 overrides default flow on gateway", () => {
  const nodeOrder = ["S", "G", "A", "B", "E"];
  const graphNodeRank = makeGraphNodeRank(nodeOrder);
  const model = buildInterviewModel({
    timelineBaseView: makeTimelineBaseView(nodeOrder, {
      S: "startEvent",
      G: "exclusiveGateway",
      A: "task",
      B: "task",
      E: "endEvent",
    }),
    graph: {
      nodesById: {
        S: { id: "S", type: "startevent", name: "Start" },
        G: { id: "G", type: "exclusivegateway", name: "Decision", defaultFlowId: "F_G_B" },
        A: { id: "A", type: "task", name: "Path A" },
        B: { id: "B", type: "task", name: "Path B" },
        E: { id: "E", type: "endevent", name: "End" },
      },
      outgoingByNode: {
        S: [{ id: "F_S_G", targetId: "G" }],
        G: [{ id: "F_G_A", targetId: "A" }, { id: "F_G_B", targetId: "B" }],
        A: [{ id: "F_A_E", targetId: "E" }],
        B: [{ id: "F_B_E", targetId: "E" }],
        E: [],
      },
      incomingByNode: {},
      gatewayById: {
        G: {
          id: "G",
          type: "exclusivegateway",
          mode: "xor",
          defaultFlowId: "F_G_B",
          isSplit: true,
          isJoin: false,
          splitBranches: [
            { flowId: "F_G_A", targetId: "A", condition: "Да", tier: "P0" },
            { flowId: "F_G_B", targetId: "B", condition: "Нет", tier: "P2" },
          ],
          joinNodeId: "",
        },
      },
      endNodeIds: ["E"],
      reachableNodeIds: nodeOrder,
    },
    nodeMetaById: makeNodeMetaById([
      { id: "S", title: "Start", bpmnKind: "startEvent" },
      { id: "G", title: "Decision", bpmnKind: "exclusiveGateway" },
      { id: "A", title: "Path A", bpmnKind: "task" },
      { id: "B", title: "Path B", bpmnKind: "task" },
      { id: "E", title: "End", bpmnKind: "endEvent" },
    ]),
    graphOrderLocked: true,
    graphNodeRank,
  });

  assert.deepEqual(model.mainlineNodeIds, ["S", "G", "A", "E"]);
  const gStep = model.timelineView.find((row) => row.node_bind_id === "G");
  const primary = toArraySafe(gStep?.gateway_branch_previews).find((branch) => !!branch?.isPrimary);
  assert.equal(toTextSafe(primary?.flowId), "F_G_A");
  assert.equal(toTextSafe(primary?.primaryReasonCode), "tier_p0");
  assert.equal(toTextSafe(primary?.primaryReasonLabel), "Primary: P0");
});

test("buildInterviewModel: tier P1 is selected when P0 is missing", () => {
  const nodeOrder = ["S", "G", "A", "B", "E"];
  const graphNodeRank = makeGraphNodeRank(nodeOrder);
  const model = buildInterviewModel({
    timelineBaseView: makeTimelineBaseView(nodeOrder, {
      S: "startEvent",
      G: "exclusiveGateway",
      A: "task",
      B: "task",
      E: "endEvent",
    }),
    graph: {
      nodesById: {
        S: { id: "S", type: "startevent", name: "Start" },
        G: { id: "G", type: "exclusivegateway", name: "Decision" },
        A: { id: "A", type: "task", name: "Path A" },
        B: { id: "B", type: "task", name: "Path B" },
        E: { id: "E", type: "endevent", name: "End" },
      },
      outgoingByNode: {
        S: [{ id: "F_S_G", targetId: "G" }],
        G: [{ id: "F_G_A", targetId: "A" }, { id: "F_G_B", targetId: "B" }],
        A: [{ id: "F_A_E", targetId: "E" }],
        B: [{ id: "F_B_E", targetId: "E" }],
        E: [],
      },
      incomingByNode: {},
      gatewayById: {
        G: {
          id: "G",
          type: "exclusivegateway",
          mode: "xor",
          defaultFlowId: "",
          isSplit: true,
          isJoin: false,
          splitBranches: [
            { flowId: "F_G_A", targetId: "A", condition: "Да", tier: "P2" },
            { flowId: "F_G_B", targetId: "B", condition: "Нет", tier: "P1" },
          ],
          joinNodeId: "",
        },
      },
      endNodeIds: ["E"],
      reachableNodeIds: nodeOrder,
    },
    nodeMetaById: makeNodeMetaById([
      { id: "S", title: "Start", bpmnKind: "startEvent" },
      { id: "G", title: "Decision", bpmnKind: "exclusiveGateway" },
      { id: "A", title: "Path A", bpmnKind: "task" },
      { id: "B", title: "Path B", bpmnKind: "task" },
      { id: "E", title: "End", bpmnKind: "endEvent" },
    ]),
    graphOrderLocked: true,
    graphNodeRank,
  });

  assert.deepEqual(model.mainlineNodeIds, ["S", "G", "B", "E"]);
  const gStep = model.timelineView.find((row) => row.node_bind_id === "G");
  const primary = toArraySafe(gStep?.gateway_branch_previews).find((branch) => !!branch?.isPrimary);
  assert.equal(toTextSafe(primary?.flowId), "F_G_B");
});

test("buildInterviewModel: gateway primary without default uses shortest path then flowId tie-break", () => {
  const nodeOrder = ["S", "G", "A", "B", "X", "E"];
  const graphNodeRank = makeGraphNodeRank(nodeOrder);
  const model = buildInterviewModel({
    timelineBaseView: makeTimelineBaseView(nodeOrder, {
      S: "startEvent",
      G: "exclusiveGateway",
      A: "task",
      B: "task",
      X: "task",
      E: "endEvent",
    }),
    graph: {
      nodesById: {
        S: { id: "S", type: "startevent", name: "Start" },
        G: { id: "G", type: "exclusivegateway", name: "Decision" },
        A: { id: "A", type: "task", name: "A" },
        B: { id: "B", type: "task", name: "B" },
        X: { id: "X", type: "task", name: "X" },
        E: { id: "E", type: "endevent", name: "End" },
      },
      outgoingByNode: {
        S: [{ id: "F_S_G", targetId: "G" }],
        G: [{ id: "F_G_02", targetId: "A" }, { id: "F_G_01", targetId: "B" }],
        A: [{ id: "F_A_X", targetId: "X" }],
        B: [{ id: "F_B_E", targetId: "E" }],
        X: [{ id: "F_X_E", targetId: "E" }],
        E: [],
      },
      incomingByNode: {},
      gatewayById: {
        G: {
          id: "G",
          type: "exclusivegateway",
          mode: "xor",
          defaultFlowId: "",
          isSplit: true,
          isJoin: false,
          splitBranches: [
            { flowId: "F_G_02", targetId: "A", condition: "A branch" },
            { flowId: "F_G_01", targetId: "B", condition: "B branch" },
          ],
          joinNodeId: "",
        },
      },
      endNodeIds: ["E"],
      reachableNodeIds: nodeOrder,
    },
    nodeMetaById: makeNodeMetaById([
      { id: "S", title: "Start", bpmnKind: "startEvent" },
      { id: "G", title: "Decision", bpmnKind: "exclusiveGateway" },
      { id: "A", title: "A", bpmnKind: "task" },
      { id: "B", title: "B", bpmnKind: "task" },
      { id: "X", title: "X", bpmnKind: "task" },
      { id: "E", title: "End", bpmnKind: "endEvent" },
    ]),
    graphOrderLocked: true,
    graphNodeRank,
  });

  // B is shorter to End (1 edge) than A (2 edges), so B is primary even with lexical flow ids.
  assert.deepEqual(model.mainlineNodeIds, ["S", "G", "B", "E"]);
});

test("buildInterviewModel: detects mainline cycle and emits loop marker", () => {
  const nodeOrder = ["S", "A", "B"];
  const graphNodeRank = makeGraphNodeRank(nodeOrder);
  const model = buildInterviewModel({
    timelineBaseView: makeTimelineBaseView(nodeOrder, {
      S: "startEvent",
      A: "task",
      B: "task",
    }),
    graph: {
      nodesById: {
        S: { id: "S", type: "startevent", name: "Start" },
        A: { id: "A", type: "task", name: "A" },
        B: { id: "B", type: "task", name: "B" },
      },
      outgoingByNode: {
        S: [{ id: "F_S_A", targetId: "A" }],
        A: [{ id: "F_A_B", targetId: "B" }],
        B: [{ id: "F_B_A", targetId: "A" }],
      },
      incomingByNode: {},
      gatewayById: {},
      endNodeIds: [],
      reachableNodeIds: nodeOrder,
    },
    nodeMetaById: makeNodeMetaById([
      { id: "S", title: "Start", bpmnKind: "startEvent" },
      { id: "A", title: "A", bpmnKind: "task" },
      { id: "B", title: "B", bpmnKind: "task" },
    ]),
    graphOrderLocked: true,
    graphNodeRank,
  });

  assert.deepEqual(model.mainlineNodeIds, ["S", "A", "B"]);
  assert.equal(toTextSafe(model.mainlineLoopMarker?.targetNodeId), "A");
  assert.ok(toArraySafe(model.warnings).some((item) => String(item).includes("Mainline loop detected")));
});

test("buildInterviewModel: allows continue only to downstream mainline nodes and uses sequential graph numbers", () => {
  const nodeOrder = ["S", "G", "M2", "M3", "X", "E"];
  const graphNodeRank = makeGraphNodeRank(nodeOrder);
  const timelineBaseView = makeTimelineBaseView(nodeOrder, {
    S: "startEvent",
    G: "exclusiveGateway",
    M2: "task",
    M3: "task",
    X: "task",
    E: "endEvent",
  }).map((row, idx) => ({
    ...row,
    seq: 70 + idx,
    seq_label: String(70 + idx),
  }));

  const model = buildInterviewModel({
    timelineBaseView,
    graph: {
      nodesById: {
        S: { id: "S", type: "startevent", name: "Start" },
        G: { id: "G", type: "exclusivegateway", name: "Decision", defaultFlowId: "F_G_M2" },
        M2: { id: "M2", type: "task", name: "Mainline 2" },
        M3: { id: "M3", type: "task", name: "Mainline 3" },
        X: { id: "X", type: "task", name: "Alt step" },
        E: { id: "E", type: "endevent", name: "End" },
      },
      outgoingByNode: {
        S: [{ id: "F_S_G", targetId: "G" }],
        G: [{ id: "F_G_M2", targetId: "M2" }, { id: "F_G_X", targetId: "X" }],
        M2: [{ id: "F_M2_M3", targetId: "M3" }],
        X: [{ id: "F_X_M3", targetId: "M3" }],
        M3: [{ id: "F_M3_E", targetId: "E" }],
        E: [],
      },
      incomingByNode: {},
      gatewayById: {
        G: {
          id: "G",
          type: "exclusivegateway",
          mode: "xor",
          defaultFlowId: "F_G_M2",
          isSplit: true,
          isJoin: false,
          splitBranches: [
            { flowId: "F_G_M2", targetId: "M2", condition: "Да" },
            { flowId: "F_G_X", targetId: "X", condition: "Нет" },
          ],
          joinNodeId: "",
        },
      },
      endNodeIds: ["E"],
      reachableNodeIds: nodeOrder,
    },
    nodeMetaById: makeNodeMetaById([
      { id: "S", title: "Start", bpmnKind: "startEvent" },
      { id: "G", title: "Decision", bpmnKind: "exclusiveGateway" },
      { id: "M2", title: "Mainline 2", bpmnKind: "task" },
      { id: "M3", title: "Mainline 3", bpmnKind: "task" },
      { id: "X", title: "Alt step", bpmnKind: "task" },
      { id: "E", title: "End", bpmnKind: "endEvent" },
    ]),
    graphOrderLocked: true,
    graphNodeRank,
  });

  assert.equal(model.graphNoByNodeId.S, "1");
  assert.equal(model.graphNoByNodeId.G, "2");
  assert.equal(model.graphNoByNodeId.M2, "3");
  assert.equal(model.graphNoByNodeId.M3, "4");

  const gStep = model.timelineView.find((row) => row.node_bind_id === "G");
  const noBranch = toArraySafe(gStep?.between_branches_item?.branches).find((branch) => String(branch?.label || "").toLowerCase() === "нет");
  assert.ok(noBranch);
  assert.ok(toArraySafe(noBranch.children).some((node) => node.kind === "step" && node.nodeId === "X"));
  assert.ok(toArraySafe(noBranch.children).some((node) => node.kind === "continue" && node.targetNodeId === "M3"));
});

function toTextSafe(value) {
  return String(value || "");
}

function toArraySafe(value) {
  return Array.isArray(value) ? value : [];
}
