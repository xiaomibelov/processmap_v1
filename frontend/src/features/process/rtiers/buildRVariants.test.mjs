import test from "node:test";
import assert from "node:assert/strict";

import { buildRVariants } from "./buildRVariants.js";

function makeFlow(id, sourceId, targetId, condition = "") {
  return {
    id,
    sourceId,
    targetId,
    condition,
    name: condition,
  };
}

function makeGraph({ nodes, flows, startNodeIds, endNodeIds, gatewayById = {} }) {
  const nodesById = {};
  const flowsById = {};
  const outgoingByNode = {};
  const incomingByNode = {};
  Object.keys(nodes || {}).forEach((nodeId) => {
    nodesById[nodeId] = { id: nodeId, ...nodes[nodeId] };
    outgoingByNode[nodeId] = [];
    incomingByNode[nodeId] = [];
  });
  (flows || []).forEach((flow) => {
    flowsById[flow.id] = flow;
    outgoingByNode[flow.sourceId] = outgoingByNode[flow.sourceId] || [];
    incomingByNode[flow.targetId] = incomingByNode[flow.targetId] || [];
    outgoingByNode[flow.sourceId].push(flow);
    incomingByNode[flow.targetId].push(flow);
  });
  return {
    nodesById,
    flowsById,
    outgoingByNode,
    incomingByNode,
    startNodeIds: startNodeIds || [],
    endNodeIds: endNodeIds || [],
    gatewayById,
  };
}

test("buildRVariants uses flow_meta rtier and hits success/escalation ends", () => {
  const graph = makeGraph({
    nodes: {
      S: { type: "startevent", name: "Start" },
      G: { type: "exclusivegateway", name: "Decision", defaultFlowId: "F_G_A" },
      A: { type: "task", name: "Happy" },
      B: { type: "task", name: "Escalate" },
      END_OK: { type: "endevent", name: "Success end" },
      END_FAIL: { type: "endevent", name: "Fail escalation" },
    },
    flows: [
      makeFlow("F_S_G", "S", "G"),
      makeFlow("F_G_A", "G", "A", "Да"),
      makeFlow("F_G_B", "G", "B", "Нет"),
      makeFlow("F_A_OK", "A", "END_OK"),
      makeFlow("F_B_FAIL", "B", "END_FAIL"),
    ],
    startNodeIds: ["S"],
    endNodeIds: ["END_OK", "END_FAIL"],
    gatewayById: {
      G: { defaultFlowId: "F_G_A" },
    },
  });

  const variants = buildRVariants({
    graph,
    flowMeta: {
      F_G_A: { rtier: "R0", source: "manual" },
      F_G_B: { rtier: "R2", source: "manual" },
    },
    scopeStartId: "S",
    successEndId: "END_OK",
    failEndId: "END_FAIL",
    maxLoopIters: 1,
  });

  const r0 = variants.find((variant) => variant.key === "R0");
  const r2 = variants.find((variant) => variant.key === "R2");
  assert.ok(r0);
  assert.ok(r2);
  assert.equal(r0.stopReason, "success");
  assert.equal(r2.stopReason, "escalation");
  assert.equal(r0.steps.slice(-1)[0]?.nodeId, "END_OK");
  assert.equal(r2.steps.slice(-1)[0]?.nodeId, "END_FAIL");
});

test("buildRVariants infers R1 fallback when flow_meta has no rtier", () => {
  const graph = makeGraph({
    nodes: {
      S: { type: "startevent", name: "Start" },
      G: { type: "exclusivegateway", name: "Decision", defaultFlowId: "F_G_A" },
      A: { type: "task", name: "Primary" },
      C: { type: "task", name: "Alternative" },
      END_OK: { type: "endevent", name: "Success end" },
    },
    flows: [
      makeFlow("F_S_G", "S", "G"),
      makeFlow("F_G_A", "G", "A", "A"),
      makeFlow("F_G_C", "G", "C", "C"),
      makeFlow("F_A_OK", "A", "END_OK"),
      makeFlow("F_C_OK", "C", "END_OK"),
    ],
    startNodeIds: ["S"],
    endNodeIds: ["END_OK"],
    gatewayById: {
      G: { defaultFlowId: "F_G_A" },
    },
  });

  const variants = buildRVariants({
    graph,
    flowMeta: {},
    scopeStartId: "S",
    successEndId: "END_OK",
    maxLoopIters: 1,
  });
  const r0 = variants.find((variant) => variant.key === "R0");
  const r1 = variants.find((variant) => variant.key === "R1");
  assert.ok(r0);
  assert.ok(r1);
  assert.equal(r0.stopReason, "success");
  assert.equal(r1.stopReason, "success");
  assert.notEqual(
    (r0.edges || []).find((edge) => edge.from === "G")?.flowId,
    (r1.edges || []).find((edge) => edge.from === "G")?.flowId,
  );
});

test("buildRVariants caps loop expansion to one iteration", () => {
  const graph = makeGraph({
    nodes: {
      S: { type: "startevent", name: "Start" },
      G: { type: "exclusivegateway", name: "Decision", defaultFlowId: "F_G_A" },
      A: { type: "task", name: "Primary" },
      L: { type: "task", name: "Loop task" },
      END_OK: { type: "endevent", name: "Success end" },
    },
    flows: [
      makeFlow("F_S_G", "S", "G"),
      makeFlow("F_G_A", "G", "A", "A"),
      makeFlow("F_G_L", "G", "L", "L"),
      makeFlow("F_A_OK", "A", "END_OK"),
      makeFlow("F_L_L", "L", "L"),
    ],
    startNodeIds: ["S"],
    endNodeIds: ["END_OK"],
    gatewayById: {
      G: { defaultFlowId: "F_G_A" },
    },
  });
  const variants = buildRVariants({
    graph,
    flowMeta: {
      F_G_A: { rtier: "R0", source: "manual" },
      F_G_L: { rtier: "R2", source: "manual" },
    },
    scopeStartId: "S",
    successEndId: "END_OK",
    maxLoopIters: 1,
  });
  const r2 = variants.find((variant) => variant.key === "R2");
  assert.ok(r2);
  assert.equal(r2.stopReason, "loop_cutoff");
  assert.equal((r2.steps || []).some((step) => step.loop === true), true);
});
