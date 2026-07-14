import assert from "node:assert/strict";
import test from "node:test";

import { createV2OverlayHost, computeSequenceFlowMidpoint } from "./v2OverlayRenderer.js";

function createMockElement(tag) {
  const classList = new Set();
  const children = [];
  return {
    tagName: tag,
    classList: {
      add: (cls) => classList.add(cls),
      contains: (cls) => classList.has(cls),
      toggle: (cls, force) => {
        if (force === undefined) {
          if (classList.has(cls)) classList.delete(cls);
          else classList.add(cls);
        } else if (force) classList.add(cls);
        else classList.delete(cls);
        return classList.has(cls);
      },
    },
    style: { setProperty: () => {} },
    dataset: {},
    children,
    appendChild: (child) => { children.push(child); return child; },
    querySelectorAll: () => [],
  };
}

function setupMockDom() {
  globalThis.document = {
    createElement: (tag) => createMockElement(tag),
    createDocumentFragment: () => ({ appendChild: () => {} }),
    querySelectorAll: () => [],
  };
  globalThis.CSS = { escape: (s) => s.replace(/[^a-zA-Z0-9_-]/g, "\\$&") };
}

function findByClass(node, cls) {
  if (node.classList && node.classList.contains(cls)) return node;
  for (const child of node.children || []) {
    const found = findByClass(child, cls);
    if (found) return found;
  }
  return null;
}

test("createV2OverlayHost: creates host with property rows", () => {
  setupMockDom();
  const result = createV2OverlayHost(
    { id: "T1", type: "bpmn:Task", x: 0, y: 0, width: 100, height: 80 },
    {
      title: "Props",
      properties: [
        { name: "priority", value: "high" },
        { name: "owner", value: "team" },
      ],
    },
    false
  );
  assert.ok(result && result.host);
  assert.ok(result.host.classList.contains("fpc-overlay-v2-host"));
  const list = findByClass(result.host, "fpc-overlay-v2-list");
  assert.ok(list);
  assert.equal(list.children.length, 2);
});

test("createV2OverlayHost: empty properties renders list with no items", () => {
  setupMockDom();
  const result = createV2OverlayHost(
    { id: "T1", type: "bpmn:Task", x: 0, y: 0, width: 100, height: 80 },
    { title: "", properties: [] },
    false
  );
  assert.ok(result && result.host);
  const list = findByClass(result.host, "fpc-overlay-v2-list");
  assert.equal(list.children.length, 0);
});

test("computeSequenceFlowMidpoint: returns midpoint of waypoints", () => {
  const waypoints = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const mid = computeSequenceFlowMidpoint(waypoints);
  assert.equal(mid.x, 50);
  assert.equal(mid.y, 0);
});

test("createV2OverlayHost: displayName adds the title line and host marker class", () => {
  setupMockDom();
  const result = createV2OverlayHost(
    { id: "T1", type: "bpmn:Task", x: 0, y: 0, width: 100, height: 80 },
    {
      title: "Props",
      displayName: "Перенести container_1 в microwave_1",
      properties: [{ name: "object_ref", value: "container_1" }],
    },
    false
  );
  assert.ok(result.host.classList.contains("fpc-overlay-v2-host--has-display-name"));
  const titleEl = findByClass(result.host, "fpc-overlay-v2-title");
  assert.ok(titleEl);
  assert.equal(titleEl.textContent, "Перенести container_1 в microwave_1");
  // Rows are still rendered (CSS hides them in idle; expanded keeps them).
  const list = findByClass(result.host, "fpc-overlay-v2-list");
  assert.equal(list.children.length, 1);
});

test("createV2OverlayHost: no displayName → no title, no marker class", () => {
  setupMockDom();
  const result = createV2OverlayHost(
    { id: "T1", type: "bpmn:Task", x: 0, y: 0, width: 100, height: 80 },
    { title: "Props", properties: [{ name: "priority", value: "high" }] },
    false
  );
  assert.equal(result.host.classList.contains("fpc-overlay-v2-host--has-display-name"), false);
  assert.equal(findByClass(result.host, "fpc-overlay-v2-title"), null);
});
