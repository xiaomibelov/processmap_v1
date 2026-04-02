import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── helpers (mirror of source) ──────────────────────────────────

function toText(v) { return v == null ? "" : String(v); }
function toArray(v) { return Array.isArray(v) ? v : []; }
function asObject(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }

// ── A. stitchScenarioSequenceByLinkEvents (copied from source) ──

function buildLinkThrowToCatchMap(dodSnapshotRaw) {
  const out = {};
  toArray(dodSnapshotRaw?.link_groups).forEach((groupRaw) => {
    const group = asObject(groupRaw);
    const catches = toArray(group?.catch_ids).map((id) => toText(id)).filter(Boolean);
    if (!catches.length) return;
    const target = catches[0];
    toArray(group?.throw_ids).map((id) => toText(id)).filter(Boolean).forEach((throwId) => {
      if (!out[throwId]) out[throwId] = target;
    });
  });
  return out;
}

function flowPriorityForReport(flowRaw) {
  const flow = asObject(flowRaw);
  const tier = toText(flow?.tier).toUpperCase();
  if (tier === "P0") return 0;
  if (tier === "P1") return 1;
  if (tier === "P2") return 3;
  return 2;
}

function buildReportNodeStub(graphModelRaw, nodeIdRaw) {
  const nodesById = asObject(asObject(graphModelRaw)?.nodesById);
  const nodeId = toText(nodeIdRaw);
  const node = asObject(nodesById[nodeId]);
  return { node_id: nodeId, bpmn_ref: nodeId, title: toText(node?.name || nodeId) || nodeId, lane_id: "", lane_name: "" };
}

function stitchScenarioSequenceByLinkEvents({ scenarioSequence, graphModel, dodSnapshot, maxAppend = 96 }) {
  const base = toArray(scenarioSequence).map((stepRaw) => {
    const step = asObject(stepRaw);
    const nodeId = toText(step?.node_id || step?.bpmn_ref);
    if (!nodeId) return null;
    return { ...step, node_id: nodeId, bpmn_ref: toText(step?.bpmn_ref || nodeId), title: toText(step?.title || nodeId) || nodeId };
  }).filter(Boolean);
  if (!base.length) return { sequence: [], stitched: false };
  const graph = asObject(graphModel);
  const outgoingByNode = asObject(graph?.outgoingByNode);
  const nodesById = asObject(graph?.nodesById);
  const throwToCatch = buildLinkThrowToCatchMap(dodSnapshot);
  if (!Object.keys(throwToCatch).length) return { sequence: base, stitched: false };

  const next = [...base];
  const seenNodeIds = new Set(next.map((s) => toText(s?.node_id)).filter(Boolean));
  let stitched = false;
  let appendBudget = Math.max(8, Number(maxAppend || 96));
  let tailNodeId = toText(next[next.length - 1]?.node_id);
  while (appendBudget > 0 && tailNodeId) {
    const outgoing = toArray(outgoingByNode[tailNodeId]);
    const jumpNodeId = toText(throwToCatch[tailNodeId]);
    let nextNodeId = "";
    let hint = "";
    if (!outgoing.length && jumpNodeId) {
      nextNodeId = jumpNodeId;
      hint = "link_jump";
    } else if (outgoing.length && stitched) {
      const sorted = [...outgoing].sort((a, b) => flowPriorityForReport(a) - flowPriorityForReport(b));
      nextNodeId = toText(sorted[0]?.toId || sorted[0]?.to_id || sorted[0]?.target_id);
      hint = "link_continuation";
    } else {
      break;
    }
    if (!nextNodeId || seenNodeIds.has(nextNodeId)) break;
    const nextNode = asObject(nodesById[nextNodeId]);
    next.push({
      ...buildReportNodeStub(graph, nextNodeId),
      order_index: next.length + 1,
      row_type: toText(nextNode?.kind || nextNode?.type || "task"),
      node_type: toText(nextNode?.kind || nextNode?.type || "task"),
      title: toText(nextNode?.name || nextNodeId) || nextNodeId,
      lane_name: "", lane_id: toText(nextNode?.laneId || ""),
      decision: {}, report_hint: hint,
    });
    stitched = true;
    seenNodeIds.add(nextNodeId);
    tailNodeId = nextNodeId;
    appendBudget -= 1;
  }
  if (!stitched) return { sequence: base, stitched: false };
  return { sequence: next, stitched: true };
}

// ── B. buildFlowMaps (copied from source) ──

function buildFlowMaps(dodSnapshot) {
  const incomingByNodeId = {};
  const outgoingByNodeId = {};
  toArray(dodSnapshot?.bpmn_flows).forEach((flowRaw) => {
    const flow = asObject(flowRaw);
    const sourceId = toText(flow?.from_id || flow?.source_id);
    const targetId = toText(flow?.to_id || flow?.target_id);
    if (targetId) {
      if (!incomingByNodeId[targetId]) incomingByNodeId[targetId] = [];
      incomingByNodeId[targetId].push(flow);
    }
    if (sourceId) {
      if (!outgoingByNodeId[sourceId]) outgoingByNodeId[sourceId] = [];
      outgoingByNodeId[sourceId].push(flow);
    }
  });
  return { incomingByNodeId, outgoingByNodeId };
}

// ── C. buildDodByNodeId (copied from source) ──

function buildDodByNodeId(dodSnapshot) {
  const out = {};
  toArray(dodSnapshot?.steps).forEach((stepRaw) => {
    const step = asObject(stepRaw);
    const nodeId = toText(step?.node_id || step?.nodeId);
    if (!nodeId) return;
    const missing = toArray(asObject(step?.dod)?.missingKeys);
    if (!missing.length) return;
    out[nodeId] = missing.map((k) => toText(k)).filter(Boolean);
  });
  return out;
}

// ════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════

describe("A — stitchScenarioSequenceByLinkEvents: continuation past catch node", () => {
  // throw_1 → (link jump) → catch_1 → (outgoing edge) → task_after_catch
  const graphModel = {
    nodesById: {
      task_1: { name: "Task 1" },
      throw_1: { name: "Throw 1", kind: "intermediateThrowEvent" },
      catch_1: { name: "Catch 1", kind: "intermediateCatchEvent" },
      task_after_catch: { name: "Task After Catch", kind: "task" },
    },
    outgoingByNode: {
      task_1: [{ toId: "throw_1", tier: "P0" }],
      // throw_1 has NO outgoing (that's why link jump triggers)
      catch_1: [{ toId: "task_after_catch", tier: "P0" }],
    },
  };
  const dodSnapshot = {
    link_groups: [{ throw_ids: ["throw_1"], catch_ids: ["catch_1"] }],
  };

  it("should continue past catch node to downstream task", () => {
    const seq = [
      { node_id: "task_1", title: "Task 1" },
      { node_id: "throw_1", title: "Throw 1" },
    ];
    const result = stitchScenarioSequenceByLinkEvents({
      scenarioSequence: seq,
      graphModel,
      dodSnapshot,
    });
    assert.equal(result.stitched, true);
    const nodeIds = result.sequence.map((s) => s.node_id);
    assert.ok(nodeIds.includes("catch_1"), "catch node must be present");
    assert.ok(nodeIds.includes("task_after_catch"), "downstream task after catch must be present");
    const catchStep = result.sequence.find((s) => s.node_id === "catch_1");
    assert.equal(catchStep.report_hint, "link_jump");
    const contStep = result.sequence.find((s) => s.node_id === "task_after_catch");
    assert.equal(contStep.report_hint, "link_continuation");
  });

  it("should not loop if downstream leads back to seen node", () => {
    const loopGraph = {
      nodesById: { ...graphModel.nodesById },
      outgoingByNode: {
        ...graphModel.outgoingByNode,
        task_after_catch: [{ toId: "task_1", tier: "P0" }],
      },
    };
    const seq = [
      { node_id: "task_1", title: "Task 1" },
      { node_id: "throw_1", title: "Throw 1" },
    ];
    const result = stitchScenarioSequenceByLinkEvents({
      scenarioSequence: seq,
      graphModel: loopGraph,
      dodSnapshot,
    });
    assert.equal(result.stitched, true);
    // Must stop: task_1 already seen
    const nodeIds = result.sequence.map((s) => s.node_id);
    assert.ok(!nodeIds.includes("task_1_dup"), "no duplicate nodes");
    assert.equal(new Set(nodeIds).size, nodeIds.length, "all node ids unique");
  });
});

describe("B — buildFlowMaps: reads bpmn_flows with from_id / to_id", () => {
  it("should index flows from dodSnapshot.bpmn_flows", () => {
    const dodSnapshot = {
      bpmn_flows: [
        { flow_id: "f1", from_id: "node_a", to_id: "node_b", tier: "P0" },
        { flow_id: "f2", from_id: "node_b", to_id: "node_c", tier: "P1" },
        { flow_id: "f3", from_id: "node_a", to_id: "node_c", tier: "P2" },
      ],
    };
    const { incomingByNodeId, outgoingByNodeId } = buildFlowMaps(dodSnapshot);
    assert.equal(outgoingByNodeId["node_a"].length, 2);
    assert.equal(outgoingByNodeId["node_b"].length, 1);
    assert.equal(incomingByNodeId["node_b"].length, 1);
    assert.equal(incomingByNodeId["node_c"].length, 2);
    assert.equal(incomingByNodeId["node_a"], undefined);
  });

  it("should return empty maps when bpmn_flows is absent", () => {
    const { incomingByNodeId, outgoingByNodeId } = buildFlowMaps({});
    assert.deepEqual(incomingByNodeId, {});
    assert.deepEqual(outgoingByNodeId, {});
  });

  it("should NOT read from .flows (old shape)", () => {
    const dodSnapshot = {
      flows: [{ source_id: "x", target_id: "y" }],
    };
    const { incomingByNodeId, outgoingByNodeId } = buildFlowMaps(dodSnapshot);
    assert.deepEqual(incomingByNodeId, {});
    assert.deepEqual(outgoingByNodeId, {});
  });
});

describe("C — buildDodByNodeId: reads steps[*].dod.missingKeys", () => {
  it("should build missing index from steps entries", () => {
    const dodSnapshot = {
      steps: [
        { node_id: "n1", dod: { missingKeys: ["hasTitle", "hasIncoming"] } },
        { node_id: "n2", dod: { missingKeys: [] } },
        { node_id: "n3", dod: { missingKeys: ["hasLane"] } },
      ],
    };
    const result = buildDodByNodeId(dodSnapshot);
    assert.deepEqual(result["n1"], ["hasTitle", "hasIncoming"]);
    assert.equal(result["n2"], undefined, "empty missingKeys should not appear");
    assert.deepEqual(result["n3"], ["hasLane"]);
  });

  it("should return empty when steps have no dod", () => {
    const dodSnapshot = {
      steps: [{ node_id: "n1" }],
    };
    const result = buildDodByNodeId(dodSnapshot);
    assert.deepEqual(result, {});
  });

  it("should NOT read from top-level .missing (old shape)", () => {
    const dodSnapshot = {
      missing: [{ node_id: "n1", kind: "hasTitle" }],
    };
    const result = buildDodByNodeId(dodSnapshot);
    assert.deepEqual(result, {});
  });
});
