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

function fakeElementWithProps(id, props, name = "Task") {
  return {
    id,
    type: "bpmn:Task",
    businessObject: {
      id,
      name,
      $type: "bpmn:Task",
      extensionElements: {
        values: [
          {
            $type: "camunda:properties",
            values: props.map(([pname, pvalue]) => ({ name: pname, value: pvalue })),
          },
        ],
      },
    },
  };
}

test("resolveV2OverlayContent: disabled preview does not suppress BPMN fallback when forceShow", () => {
  const inst = fakeInst([fakeElementWithProps("T1", [["priority", "high"]])]);
  const previewMap = {
    T1: { enabled: false, elementId: "T1", items: [] },
  };
  const content = resolveV2OverlayContent({ elementId: "T1", inst, previewMap, forceShow: true });
  assert.ok(content, "expected BPMN-derived content despite disabled preview entry");
  assert.equal(content.source, "bpmn");
  assert.deepEqual(content.properties, [{ name: "priority", value: "high" }]);
});

test("resolveV2OverlayContent: empty enabled preview does not suppress BPMN fallback when forceShow", () => {
  const inst = fakeInst([fakeElementWithProps("T1", [["priority", "high"]])]);
  const previewMap = {
    T1: { enabled: true, elementId: "T1", items: [] },
  };
  const content = resolveV2OverlayContent({ elementId: "T1", inst, previewMap, forceShow: true });
  assert.ok(content, "expected BPMN-derived content despite empty preview entry");
  assert.equal(content.source, "bpmn");
});

test("resolveV2OverlayContent: forceShow treats empty preview like no preview entry", () => {
  const inst = fakeInst([fakeElement("T1", "Task")]);
  const previewMap = {
    T1: { enabled: false, elementId: "T1", items: [] },
  };
  const withEmptyPreview = resolveV2OverlayContent({ elementId: "T1", inst, previewMap, forceShow: true });
  const withoutPreview = resolveV2OverlayContent({ elementId: "T1", inst, previewMap: {}, forceShow: true });
  assert.deepEqual(withEmptyPreview, withoutPreview);
});

test("mergeV2OverlaysWithPropertyPreview: forceShow keeps BPMN overlay when preview entry is empty", () => {
  const list = [{ node_id: "T1", properties: [{ name: "old", value: "old" }] }];
  const previewMap = { T1: { enabled: false, elementId: "T1", items: [] } };
  const inst = fakeInst([fakeElementWithProps("T1", [["priority", "high"]])]);
  const merged = mergeV2OverlaysWithPropertyPreview(inst, list, previewMap, { forceShow: true });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].node_id, "T1");
  assert.deepEqual(merged[0].properties, [{ name: "priority", value: "high" }]);
});

test("mergeV2OverlaysWithPropertyPreview: does not fall back when preview map has empty entry", () => {
  const list = [{ node_id: "T1", properties: [{ name: "old", value: "old" }] }];
  const previewMap = { T1: { enabled: false, elementId: "T1", items: [] } };
  const merged = mergeV2OverlaysWithPropertyPreview(fakeInst([fakeElement("T1")]), list, previewMap);
  assert.deepEqual(merged, []);
});
