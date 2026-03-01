import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeterministicIdRemap,
  clearBpmnPacks,
  listBpmnPacks,
  remapFragmentIds,
  saveBpmnPack,
  suggestBpmnPacks,
} from "./bpmnPacks.js";

function createLocalStorageMock() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
  };
}

if (typeof globalThis.window === "undefined") {
  globalThis.window = {
    localStorage: createLocalStorageMock(),
  };
} else if (!globalThis.window.localStorage) {
  globalThis.window.localStorage = createLocalStorageMock();
}

test("bpmn packs storage save/list/clear works", async () => {
  const scope = `ut_scope_${Date.now()}`;
  await clearBpmnPacks({ scope });

  const one = await saveBpmnPack({
    scope,
    title: "Quality block",
    tags: ["quality", "qc"],
    fragment: {
      nodes: [
        { id: "n1", type: "bpmn:Task", name: "Check", di: { x: 100, y: 100, w: 140, h: 80 } },
        { id: "n2", type: "bpmn:Task", name: "Approve", di: { x: 300, y: 100, w: 140, h: 80 } },
      ],
      edges: [{ id: "e1", sourceId: "n1", targetId: "n2", when: "ok" }],
    },
    entryNodeId: "n1",
    exitNodeId: "n2",
  });
  assert.equal(one.ok, true);

  const two = await saveBpmnPack({
    scope,
    title: "Packing block",
    tags: ["pack"],
    fragment: {
      nodes: [
        { id: "a", type: "bpmn:Task", name: "Pack", di: { x: 20, y: 20, w: 140, h: 80 } },
      ],
      edges: [],
    },
    entryNodeId: "a",
    exitNodeId: "a",
  });
  assert.equal(two.ok, true);

  const list = await listBpmnPacks({ scope });
  assert.equal(list.length, 2);
  assert.equal(String(list[0]?.title || ""), "Packing block");

  await clearBpmnPacks({ scope });
  const cleared = await listBpmnPacks({ scope });
  assert.equal(cleared.length, 0);
});

test("deterministic remap is stable and preserves graph links", () => {
  const fragment = {
    nodes: [
      { id: "Task_B", type: "bpmn:Task", di: { x: 0, y: 0, w: 10, h: 10 } },
      { id: "Task_A", type: "bpmn:Task", di: { x: 0, y: 0, w: 10, h: 10 } },
    ],
    edges: [{ id: "Flow_2", sourceId: "Task_A", targetId: "Task_B" }],
  };
  const map = buildDeterministicIdRemap(fragment, { prefix: "tpl" });
  assert.equal(map.Task_A, "tpl_n1");
  assert.equal(map.Task_B, "tpl_n2");
  assert.equal(map.Flow_2, "tpl_e1");

  const remapped = remapFragmentIds(fragment, map);
  assert.equal(remapped.nodes.length, 2);
  assert.equal(remapped.edges.length, 1);
  assert.equal(remapped.edges[0].sourceId, "tpl_n1");
  assert.equal(remapped.edges[0].targetId, "tpl_n2");
});

test("suggestion scoring returns best matching packs", () => {
  const packs = [
    {
      packId: "p1",
      title: "QC branch",
      tags: ["quality", "check"],
      createdAt: 1,
      fragment: { nodes: [{ type: "bpmn:Task" }] },
      hints: { defaultLaneName: "QA" },
    },
    {
      packId: "p2",
      title: "Shipping",
      tags: ["delivery"],
      createdAt: 2,
      fragment: { nodes: [{ type: "bpmn:Task" }] },
      hints: { defaultLaneName: "Logistics" },
    },
  ];
  const suggested = suggestBpmnPacks(packs, {
    name: "QA check",
    type: "bpmn:Task",
    laneName: "QA",
  });
  assert.equal(asArraySafe(suggested).length > 0, true);
  assert.equal(String(suggested[0]?.packId || ""), "p1");
});

function asArraySafe(value) {
  return Array.isArray(value) ? value : [];
}
