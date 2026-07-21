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
    style: (() => {
      const props = new Map();
      return {
        setProperty: (key, value) => { props.set(key, String(value)); },
        getPropertyValue: (key) => props.get(key) || "",
      };
    })(),
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

test("createV2OverlayHost: each property row carries its own accent and light background", () => {
  setupMockDom();
  const result = createV2OverlayHost(
    { id: "T1", type: "bpmn:Task", x: 0, y: 0, width: 100, height: 80 },
    {
      title: "Props",
      properties: [
        { name: "ingredient", value: "5" },
        { name: "ee_time", value: "2.3" },
        { name: "some_custom_field", value: "x" },
      ],
    },
    false
  );
  const list = findByClass(result.host, "fpc-overlay-v2-list");
  assert.equal(list.children.length, 3);

  const [ingredientRow, eeTimeRow, customRow] = list.children;
  // Structured map: known properties get their stable hue for both accent and bg.
  assert.equal(ingredientRow.style.getPropertyValue("--fpc-property-accent"), "hsl(217 62% 46%)");
  assert.equal(ingredientRow.style.getPropertyValue("--fpc-property-bg"), "hsl(217 74% 88%)");
  assert.equal(eeTimeRow.style.getPropertyValue("--fpc-property-accent"), "hsl(0 62% 46%)");
  assert.equal(eeTimeRow.style.getPropertyValue("--fpc-property-bg"), "hsl(0 74% 88%)");
  // Non-mapped property → fallback grid hue (20), separated from mapped hues.
  assert.equal(customRow.style.getPropertyValue("--fpc-property-accent"), "hsl(20 62% 46%)");
  assert.equal(customRow.style.getPropertyValue("--fpc-property-bg"), "hsl(20 74% 88%)");
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

test("createV2OverlayHost: row with a Google Docs URL value is marked as a doc link", () => {
  setupMockDom();
  const result = createV2OverlayHost(
    { id: "T1", type: "bpmn:Task", x: 0, y: 0, width: 100, height: 80 },
    {
      title: "Props",
      properties: [
        { name: "regulation", value: "см. https://docs.google.com/document/d/ABC123/edit?usp=sharing (регламент)" },
        { name: "owner", value: "team" },
      ],
    },
    false
  );
  const list = findByClass(result.host, "fpc-overlay-v2-list");
  const [docRow, plainRow] = list.children;
  assert.ok(docRow.classList.contains("fpc-overlay-v2-item--doc-link"));
  assert.equal(docRow.dataset.fpcDocUrl, "https://docs.google.com/document/d/ABC123/edit?usp=sharing");
  assert.equal(docRow.dataset.fpcDocTitle, "regulation");
  assert.equal(plainRow.classList.contains("fpc-overlay-v2-item--doc-link"), false);
  assert.equal(plainRow.dataset.fpcDocUrl, undefined);
});

test("createV2OverlayHost: doc link is detected even in a value truncated for display", () => {
  setupMockDom();
  const long = `https://docs.google.com/document/d/ABC123/edit ${"x".repeat(120)}`;
  const result = createV2OverlayHost(
    { id: "T1", type: "bpmn:Task", x: 0, y: 0, width: 100, height: 80 },
    { title: "Props", properties: [{ name: "spec", value: long }] },
    false
  );
  const list = findByClass(result.host, "fpc-overlay-v2-list");
  assert.ok(list.children[0].classList.contains("fpc-overlay-v2-item--doc-link"));
});

test("createV2OverlayHost: non-Google URLs are not marked", () => {
  setupMockDom();
  const result = createV2OverlayHost(
    { id: "T1", type: "bpmn:Task", x: 0, y: 0, width: 100, height: 80 },
    {
      title: "Props",
      properties: [
        { name: "sheet", value: "https://docs.google.com/spreadsheets/d/ABC/edit" },
        { name: "site", value: "https://example.com/document/d/ABC" },
      ],
    },
    false
  );
  const list = findByClass(result.host, "fpc-overlay-v2-list");
  list.children.forEach((row) => {
    assert.equal(row.classList.contains("fpc-overlay-v2-item--doc-link"), false);
  });
});
