import test from "node:test";
import assert from "node:assert/strict";

import { buildNodePathUpdatesFromFlowMeta } from "./nodePathImport.js";

function updateByNodeId(result) {
  const out = {};
  (result?.updates || []).forEach((item) => {
    const nodeId = String(item?.node_id || "");
    if (!nodeId) return;
    out[nodeId] = item;
  });
  return out;
}

test("buildNodePathUpdatesFromFlowMeta imports deterministic mapping from tiered flows", () => {
  const result = buildNodePathUpdatesFromFlowMeta({
    flowMetaById: {
      F1: { tier: "P0" },
      F2: { tier: "P0" },
      F3: { tier: "P1" },
    },
    graphContext: {
      flowEndpointsById: {
        F1: { sourceId: "N_start", targetId: "N_a" },
        F2: { sourceId: "N_a", targetId: "N_b" },
        F3: { sourceId: "N_c", targetId: "N_d" },
      },
      rankByNodeId: {
        N_start: 0,
        N_a: 1,
        N_b: 2,
        N_c: 3,
        N_d: 4,
      },
    },
  });

  assert.equal(result.stats.nodes_total, 5);
  assert.deepEqual(result.stats.components_by_tier, { P0: 1, P1: 1, P2: 0 });

  const byNodeId = updateByNodeId(result);
  assert.deepEqual(byNodeId.N_start.paths, ["P0"]);
  assert.equal(byNodeId.N_start.sequence_key, "primary");
  assert.deepEqual(byNodeId.N_a.paths, ["P0"]);
  assert.equal(byNodeId.N_a.sequence_key, "primary");
  assert.deepEqual(byNodeId.N_c.paths, ["P1"]);
  assert.equal(byNodeId.N_c.sequence_key, "mitigated_1");
});

test("buildNodePathUpdatesFromFlowMeta assigns stable sequence keys for multiple components", () => {
  const result = buildNodePathUpdatesFromFlowMeta({
    flowMetaById: {
      F1: { tier: "P1" },
      F2: { tier: "P1" },
    },
    graphContext: {
      flowEndpointsById: {
        F1: { sourceId: "A1", targetId: "A2" },
        F2: { sourceId: "B1", targetId: "B2" },
      },
      rankByNodeId: {
        A1: 1,
        A2: 2,
        B1: 10,
        B2: 11,
      },
    },
  });

  const byNodeId = updateByNodeId(result);
  assert.equal(byNodeId.A1.sequence_key, "mitigated_1");
  assert.equal(byNodeId.A2.sequence_key, "mitigated_1");
  assert.equal(byNodeId.B1.sequence_key, "mitigated_2");
  assert.equal(byNodeId.B2.sequence_key, "mitigated_2");
});

test("buildNodePathUpdatesFromFlowMeta keeps tier priority when node belongs to multiple tiers", () => {
  const result = buildNodePathUpdatesFromFlowMeta({
    flowMetaById: {
      F1: { tier: "P0" },
      F2: { tier: "P1" },
    },
    graphContext: {
      flowEndpointsById: {
        F1: { sourceId: "Shared", targetId: "NodeP0" },
        F2: { sourceId: "Shared", targetId: "NodeP1" },
      },
      rankByNodeId: {
        Shared: 0,
        NodeP0: 1,
        NodeP1: 2,
      },
    },
  });

  const byNodeId = updateByNodeId(result);
  assert.deepEqual(byNodeId.Shared.paths, ["P0", "P1"]);
  assert.equal(byNodeId.Shared.sequence_key, "primary");
});

