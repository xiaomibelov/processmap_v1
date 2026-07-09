import assert from "node:assert/strict";
import test from "node:test";

import { mergeV2OverlaysWithPropertyPreview } from "./overlayLifecycleManager.js";

function fakeElement(id, name = "", type = "bpmn:Task") {
  return {
    id,
    type,
    businessObject: { id, name, $type: type },
  };
}

function fakeRegistry(elements) {
  const byId = new Map(elements.map((el) => [el.id, el]));
  return {
    get: (id) => byId.get(id),
  };
}

function fakeInst(elements) {
  return {
    get: (name) => {
      if (name === "elementRegistry") return fakeRegistry(elements);
      return null;
    },
  };
}

test("mergeV2OverlaysWithPropertyPreview: empty preview map returns extracted overlays unchanged", () => {
  const list = [{ node_id: "Task_1", properties: [{ name: "old", value: "old" }] }];
  const merged = mergeV2OverlaysWithPropertyPreview(fakeInst([]), list, {});
  assert.deepEqual(merged, list);
});

test("mergeV2OverlaysWithPropertyPreview: overrides properties for existing overlay", () => {
  const list = [
    {
      node_id: "Task_1",
      text: "Task",
      x: 0,
      y: -40,
      width: 180,
      height: 30,
      properties: [{ name: "priority", value: "low" }],
    },
  ];
  const previewMap = {
    Task_1: {
      enabled: true,
      elementId: "Task_1",
      items: [{ key: "priority", label: "priority", value: "high" }],
    },
  };
  const merged = mergeV2OverlaysWithPropertyPreview(fakeInst([fakeElement("Task_1")]), list, previewMap);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].properties[0].value, "high");
  assert.equal(merged[0].text, "Task");
});

test("mergeV2OverlaysWithPropertyPreview: creates overlay for preview-only element", () => {
  const list = [];
  const previewMap = {
    Task_2: {
      enabled: true,
      elementId: "Task_2",
      items: [{ key: "status", label: "status", value: "done" }],
    },
  };
  const merged = mergeV2OverlaysWithPropertyPreview(
    fakeInst([fakeElement("Task_2", "Review")]),
    list,
    previewMap,
    { forceShow: true }
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].node_id, "Task_2");
  assert.equal(merged[0].properties[0].name, "status");
  assert.equal(merged[0].properties[0].value, "done");
});

test("mergeV2OverlaysWithPropertyPreview: suppresses extracted overlay when preview is enabled but empty", () => {
  const list = [
    {
      node_id: "Task_1",
      properties: [{ name: "priority", value: "low" }],
    },
  ];
  const previewMap = {
    Task_1: {
      enabled: false,
      elementId: "Task_1",
      items: [],
    },
  };
  const merged = mergeV2OverlaysWithPropertyPreview(fakeInst([fakeElement("Task_1")]), list, previewMap);
  assert.equal(merged.length, 0);
});
