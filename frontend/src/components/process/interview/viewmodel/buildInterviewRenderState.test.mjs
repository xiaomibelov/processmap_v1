import test from "node:test";
import assert from "node:assert/strict";

import { buildInterviewRenderState } from "./buildInterviewRenderState.js";

function makeRows(nodeIds) {
  return nodeIds.map((nodeId, idx) => ({
    id: `step_${idx + 1}`,
    seq: idx + 1,
    seq_label: String(idx + 1),
    action: `Step ${nodeId}`,
    node_bind_id: nodeId,
    node_bind_title: `Node ${nodeId}`,
    node_bind_kind: "task",
    node_bound: true,
    lane_name: "L1",
    lane_key: "l1",
  }));
}

test("buildInterviewRenderState: v2=off forces flat reachable mode", () => {
  const graph = {
    nodesById: {
      A: { id: "A", name: "A" },
      B: { id: "B", name: "B" },
      C: { id: "C", name: "C" },
      D: { id: "D", name: "Detached" },
    },
    outgoingByNode: {
      A: [{ targetId: "B" }],
      B: [{ targetId: "C" }],
      C: [],
      D: [],
    },
    incomingByNode: {
      A: [],
      B: [{ sourceId: "A" }],
      C: [{ sourceId: "B" }],
      D: [],
    },
    startNodeIds: ["A"],
    reachableNodeIds: ["A", "B", "C"],
  };
  const model = {
    sourceRows: makeRows(["A", "B", "C", "D"]),
    mainlineNodeIds: ["A", "B", "C"],
    timelineView: makeRows(["A", "B", "C"]),
    mainlineTimeSummary: { total_sec: 123 },
  };
  const result = buildInterviewRenderState({
    featureFlags: {
      v2Model: false,
      betweenBranches: true,
      timeModel: true,
      detachedFilter: true,
      renderMode: "full",
    },
    graph,
    model,
    graphNodeRank: { A: 0, B: 1, C: 2, D: 3 },
    nodeMetaById: {},
  });

  assert.equal(result.requestedMode, "flat");
  assert.equal(result.effectiveMode, "flat");
  assert.ok(result.warnings.some((item) => String(item).includes("v2_model=off")));
  assert.deepEqual(result.timelineView.map((row) => row.node_bind_id), ["A", "B", "C"]);
});

test("buildInterviewRenderState: full mode auto-fallbacks to mainline on anomaly", () => {
  const nodesById = {};
  const outgoingByNode = {};
  const incomingByNode = {};
  const reachableNodeIds = [];
  const graphNodeRank = {};
  for (let i = 1; i <= 31; i += 1) {
    const id = `N${i}`;
    nodesById[id] = { id, name: id };
    graphNodeRank[id] = i - 1;
    reachableNodeIds.push(id);
    if (i === 1) incomingByNode[id] = [];
    else incomingByNode[id] = [{ sourceId: `N${i - 1}` }];
    if (i < 31) outgoingByNode[id] = [{ targetId: `N${i + 1}` }];
    else outgoingByNode[id] = [];
  }
  const graph = {
    nodesById,
    outgoingByNode,
    incomingByNode,
    startNodeIds: ["N1"],
    reachableNodeIds,
  };
  const model = {
    sourceRows: makeRows(["N1", "N2", "N3"]),
    mainlineNodeIds: ["N1", "N2"],
    timelineView: makeRows(["N1", "N2", "N3"]),
    mainlineTimeSummary: { total_sec: 45 },
  };
  const result = buildInterviewRenderState({
    featureFlags: {
      v2Model: true,
      betweenBranches: true,
      timeModel: true,
      detachedFilter: true,
      renderMode: "full",
    },
    graph,
    model,
    graphNodeRank,
    nodeMetaById: {},
  });

  assert.equal(result.requestedMode, "full");
  assert.equal(result.effectiveMode, "mainline");
  assert.ok(result.warnings.some((item) => String(item).includes("Anomaly detected")));
  assert.deepEqual(result.timelineView.map((row) => row.node_bind_id), ["N1", "N2"]);
});

test("buildInterviewRenderState: can disable between-branches and time model in full mode", () => {
  const graph = {
    nodesById: {
      A: { id: "A", name: "A" },
      B: { id: "B", name: "B" },
      C: { id: "C", name: "C" },
    },
    outgoingByNode: {
      A: [{ targetId: "B" }],
      B: [{ targetId: "C" }],
      C: [],
    },
    incomingByNode: {
      A: [],
      B: [{ sourceId: "A" }],
      C: [{ sourceId: "B" }],
    },
    startNodeIds: ["A"],
    reachableNodeIds: ["A", "B", "C"],
  };
  const timeline = makeRows(["A", "B", "C"]);
  timeline[1].between_branches_item = {
    kind: "between_branches",
    branches: [{ key: "A", label: "Да", time_summary: { total_sec: 10 } }],
    time_summary: { total_sec: 10 },
  };
  timeline[1].step_time_model = { value: 10, unit: "sec" };
  timeline[1].step_time_label = "10 сек";

  const model = {
    sourceRows: timeline,
    mainlineNodeIds: ["A", "B", "C"],
    timelineView: timeline,
    mainlineTimeSummary: { total_sec: 100 },
  };
  const result = buildInterviewRenderState({
    featureFlags: {
      v2Model: true,
      betweenBranches: false,
      timeModel: false,
      detachedFilter: true,
      renderMode: "full",
    },
    graph,
    model,
    graphNodeRank: { A: 0, B: 1, C: 2 },
    nodeMetaById: {},
  });

  assert.equal(result.requestedMode, "full");
  assert.equal(result.effectiveMode, "full");
  assert.equal(result.timelineView[1].between_branches_item, null);
  assert.equal(result.timelineView[1].step_time_model, null);
  assert.equal(result.timelineView[1].step_time_label, "—");
  assert.equal(result.mainlineTimeSummary, null);
});

