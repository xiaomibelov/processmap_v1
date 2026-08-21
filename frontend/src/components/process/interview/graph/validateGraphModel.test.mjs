import test from "node:test";
import assert from "node:assert/strict";

import { validateInterviewGraphModel } from "./validateGraphModel.js";

function makeRank(nodeIds) {
  const out = {};
  nodeIds.forEach((nodeId, idx) => {
    out[nodeId] = idx;
  });
  return out;
}

function makeGraph({ nodes = [], flows = [], gatewayById = {}, startNodeIds = [], endNodeIds = [], reachableNodeIds = [] }) {
  const nodesById = {};
  const flowsById = {};
  const outgoingByNode = {};
  const incomingByNode = {};

  nodes.forEach((node) => {
    const id = String(node.id || "");
    nodesById[id] = {
      id,
      type: String(node.type || "task"),
      name: String(node.name || id),
      laneId: String(node.laneId || ""),
      incoming: [],
      outgoing: [],
    };
    outgoingByNode[id] = [];
    incomingByNode[id] = [];
  });

  flows.forEach((flow, idx) => {
    const id = String(flow.id || `F${idx + 1}`);
    const sourceId = String(flow.sourceId || "");
    const targetId = String(flow.targetId || "");
    const model = { id, sourceId, targetId, name: String(flow.name || ""), condition: String(flow.condition || "") };
    flowsById[id] = model;
    if (nodesById[sourceId]) {
      outgoingByNode[sourceId].push(model);
      nodesById[sourceId].outgoing.push(id);
    }
    if (nodesById[targetId]) {
      incomingByNode[targetId].push(model);
      nodesById[targetId].incoming.push(id);
    }
  });

  return {
    nodesById,
    flowsById,
    outgoingByNode,
    incomingByNode,
    gatewayById,
    startNodeIds,
    endNodeIds,
    reachableNodeIds,
  };
}

test("validateInterviewGraphModel: reports orphan nodes and dead-ends with repair hints", () => {
  const graph = makeGraph({
    nodes: [
      { id: "S", type: "startEvent", laneId: "L1" },
      { id: "A", type: "task", laneId: "L1" },
      { id: "E", type: "endEvent", laneId: "L1" },
      { id: "X", type: "task", laneId: "L1" },
    ],
    flows: [
      { id: "F1", sourceId: "S", targetId: "A" },
      { id: "F2", sourceId: "A", targetId: "E" },
    ],
    startNodeIds: ["S"],
    endNodeIds: ["E"],
    reachableNodeIds: ["S", "A", "E"],
  });

  const result = validateInterviewGraphModel({
    graph,
    graphNodeRank: makeRank(["S", "A", "E", "X"]),
  });
  const codes = new Set(result.issues.map((item) => item.code));
  assert.equal(codes.has("orphan_node"), true);
  assert.equal(codes.has("dead_end_non_end"), true);

  const orphan = result.issues.find((item) => item.code === "orphan_node");
  assert.equal(orphan?.nodeId, "X");
  assert.ok((orphan?.repairHints || []).length > 0);
  assert.ok((orphan?.repairHints?.[0]?.candidateSources || []).length > 0);
});

test("validateInterviewGraphModel: reports missing gateway join and parallel branch not joined", () => {
  const graph = makeGraph({
    nodes: [
      { id: "S", type: "startEvent" },
      { id: "G", type: "exclusiveGateway" },
      { id: "T1", type: "task" },
      { id: "T2", type: "task" },
      { id: "E1", type: "endEvent" },
      { id: "E2", type: "endEvent" },
      { id: "PG", type: "parallelGateway" },
      { id: "PA", type: "task" },
      { id: "PB", type: "task" },
      { id: "PJ", type: "parallelGateway" },
      { id: "PX", type: "task" },
      { id: "PE", type: "endEvent" },
    ],
    flows: [
      { id: "F1", sourceId: "S", targetId: "G" },
      { id: "F2", sourceId: "G", targetId: "T1" },
      { id: "F3", sourceId: "G", targetId: "T2" },
      { id: "F4", sourceId: "T1", targetId: "E1" },
      { id: "F5", sourceId: "T2", targetId: "E2" },
      { id: "F6", sourceId: "E1", targetId: "PG" },
      { id: "F7", sourceId: "PG", targetId: "PA" },
      { id: "F8", sourceId: "PG", targetId: "PB" },
      { id: "F9", sourceId: "PA", targetId: "PJ" },
      { id: "F10", sourceId: "PB", targetId: "PX" },
      { id: "F11", sourceId: "PJ", targetId: "PE" },
      { id: "F12", sourceId: "PX", targetId: "PE" },
    ],
    gatewayById: {
      G: {
        id: "G",
        mode: "xor",
        isSplit: true,
        isJoin: false,
        splitBranches: [
          { flowId: "F2", targetId: "T1" },
          { flowId: "F3", targetId: "T2" },
        ],
        joinNodeId: "",
      },
      PG: {
        id: "PG",
        mode: "parallel",
        isSplit: true,
        isJoin: false,
        splitBranches: [
          { flowId: "F7", targetId: "PA" },
          { flowId: "F8", targetId: "PB" },
        ],
        joinNodeId: "PJ",
      },
      PJ: {
        id: "PJ",
        mode: "parallel",
        isSplit: false,
        isJoin: true,
        splitBranches: [],
        joinNodeId: "",
      },
    },
    startNodeIds: ["S"],
    endNodeIds: ["E1", "E2", "PE"],
    reachableNodeIds: ["S", "G", "T1", "T2", "E1", "E2", "PG", "PA", "PB", "PJ", "PX", "PE"],
  });

  const result = validateInterviewGraphModel({
    graph,
    graphNodeRank: makeRank(["S", "G", "T1", "T2", "E1", "E2", "PG", "PA", "PB", "PJ", "PX", "PE"]),
  });
  const missingJoin = result.issues.find((item) => item.code === "gateway_split_missing_join");
  assert.equal(!!missingJoin, true);
  assert.deepEqual(missingJoin?.suspiciousFlowIds, ["F2", "F3"]);

  const parallelNotJoined = result.issues.find((item) => item.code === "parallel_branch_not_joined");
  assert.equal(!!parallelNotJoined, true);
  assert.equal((parallelNotJoined?.suspiciousFlowIds || []).includes("F8"), true);
});

test("validateInterviewGraphModel: reports cycle without explicit stop condition", () => {
  const graph = makeGraph({
    nodes: [
      { id: "S", type: "startEvent" },
      { id: "A", type: "task" },
      { id: "B", type: "task" },
    ],
    flows: [
      { id: "F1", sourceId: "S", targetId: "A" },
      { id: "F2", sourceId: "A", targetId: "B" },
      { id: "F3", sourceId: "B", targetId: "A" },
    ],
    startNodeIds: ["S"],
    endNodeIds: [],
    reachableNodeIds: ["S", "A", "B"],
  });

  const result = validateInterviewGraphModel({
    graph,
    graphNodeRank: makeRank(["S", "A", "B"]),
  });
  const issue = result.issues.find((item) => item.code === "cycle_without_stop_condition");
  assert.equal(!!issue, true);
  assert.equal((issue?.suspiciousFlowIds || []).includes("F2"), true);
  assert.equal((issue?.suspiciousFlowIds || []).includes("F3"), true);
});
