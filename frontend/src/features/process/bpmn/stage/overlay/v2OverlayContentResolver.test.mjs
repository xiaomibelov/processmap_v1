import assert from "node:assert/strict";
import test from "node:test";

import { resolveV2OverlayContent, mergeV2OverlaysWithPropertyPreview } from "./v2OverlayContentResolver.js";

function fakeElement(id, name = "", type = "bpmn:Task") {
  return { id, type, businessObject: { id, name, $type: type } };
}

function fakeRegistry(elements) {
  const byId = new Map(elements.map((el) => [el.id, el]));
  return { get: (id) => byId.get(id) };
}

function fakeInst(elements) {
  return { get: (name) => (name === "elementRegistry" ? fakeRegistry(elements) : null) };
}

test("resolveV2OverlayContent: preview overrides BPMN content", () => {
  const inst = fakeInst([fakeElement("T1", "Task")]);
  const previewMap = {
    T1: { enabled: true, elementId: "T1", items: [{ key: "priority", label: "priority", value: "high" }] },
  };
  const content = resolveV2OverlayContent({ elementId: "T1", inst, previewMap });
  assert.equal(content.source, "preview");
  assert.deepEqual(content.properties, [{ name: "priority", value: "high" }]);
});

test("resolveV2OverlayContent: empty preview suppresses BPMN fallback", () => {
  const inst = fakeInst([fakeElement("T1", "Task")]);
  const previewMap = {
    T1: { enabled: false, elementId: "T1", items: [] },
  };
  const content = resolveV2OverlayContent({ elementId: "T1", inst, previewMap });
  assert.equal(content, null);
});

test("resolveV2OverlayContent: falls back to BPMN when no preview entry", () => {
  const inst = fakeInst([fakeElement("T1", "Task")]);
  const content = resolveV2OverlayContent({ elementId: "T1", inst, previewMap: {} });
  assert.equal(content, null);
});

test("mergeV2OverlaysWithPropertyPreview: does not fall back when preview map has empty entry", () => {
  const list = [{ node_id: "T1", properties: [{ name: "old", value: "old" }] }];
  const previewMap = { T1: { enabled: false, elementId: "T1", items: [] } };
  const merged = mergeV2OverlaysWithPropertyPreview(fakeInst([fakeElement("T1")]), list, previewMap);
  assert.deepEqual(merged, []);
});
