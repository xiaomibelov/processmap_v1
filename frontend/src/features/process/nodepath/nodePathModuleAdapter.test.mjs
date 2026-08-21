import assert from "node:assert/strict";
import test from "node:test";

import { createNodePathModuleAdapter } from "./nodePathModuleAdapter.js";

test("node-path module adapter reads normalized single-node snapshot", () => {
  const adapter = createNodePathModuleAdapter({
    getSnapshot: () => ({ paths: ["P1", "P0", "P1"], sequence_key: "Primary alt 2", source: "manual" }),
  });
  assert.deepEqual(adapter.readSharedSnapshot("Task_1"), {
    paths: ["P0", "P1"],
    sequence_key: "primary_alt_2",
  });
});

test("node-path module adapter apply uses current persistence bridge unchanged", async () => {
  const calls = [];
  const adapter = createNodePathModuleAdapter({
    applyNodePathAssignments: async (updates, meta) => {
      calls.push({ updates, meta });
      return { ok: true };
    },
  });
  const result = await adapter.applyDraft({
    nodeId: "Task_1",
    draft: { paths: ["P1", "P0"], sequence_key: "Primary alt 2" },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{
    updates: [{
      node_id: "Task_1",
      paths: ["P0", "P1"],
      sequence_key: "primary_alt_2",
      source: "manual",
    }],
    meta: { source: "manual", from: "selected_node_paths_apply" },
  }]);
});

test("node-path module adapter reset uses current persistence bridge unchanged", async () => {
  const calls = [];
  const adapter = createNodePathModuleAdapter({
    applyNodePathAssignments: async (updates, meta) => {
      calls.push({ updates, meta });
      return { ok: true };
    },
  });
  const result = await adapter.clearSharedSnapshot({ nodeId: "Task_1" });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{
    updates: [{
      node_id: "Task_1",
      paths: [],
      sequence_key: null,
      source: "manual",
    }],
    meta: { source: "manual", from: "selected_node_paths_reset" },
  }]);
});

test("node-path module adapter keeps explicit adapter contract names and backward-compatible aliases", () => {
  const adapter = createNodePathModuleAdapter();
  assert.equal(typeof adapter.readSharedSnapshot, "function");
  assert.equal(typeof adapter.applyDraft, "function");
  assert.equal(typeof adapter.clearSharedSnapshot, "function");
  assert.equal(adapter.read, adapter.readSharedSnapshot);
  assert.equal(adapter.apply, adapter.applyDraft);
  assert.equal(adapter.reset, adapter.clearSharedSnapshot);
});
