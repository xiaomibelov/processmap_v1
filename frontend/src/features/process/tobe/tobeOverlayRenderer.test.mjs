import assert from "node:assert/strict";
import test from "node:test";

import { createTobeDocumentHost } from "./tobeOverlayRenderer.js";

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

function fakeDoc(overrides = {}) {
  return {
    id: "doc-1",
    type: "document",
    anchorElementId: "Task_1",
    x: 100,
    y: 50,
    title: "Production Plan Q3",
    url: "https://docs.google.com/document/d/ABC123/edit",
    docId: "ABC123",
    color: null,
    visible: true,
    ...overrides,
  };
}

test("createTobeDocumentHost: host classes, datasets and position", () => {
  setupMockDom();
  const result = createTobeDocumentHost(fakeDoc());
  assert.ok(result && result.host);
  assert.ok(result.host.classList.contains("fpc-tobe-doc"));
  assert.equal(result.host.dataset.fpcElementId, "Task_1");
  assert.equal(result.host.dataset.fpcTobeDocId, "doc-1");
  assert.deepEqual(result.position, { top: 50, left: 100 });
});

test("createTobeDocumentHost: at most two DOM nodes (host + title)", () => {
  setupMockDom();
  const result = createTobeDocumentHost(fakeDoc());
  assert.ok(result.host.children.length <= 1, "host has at most one child");
  const title = result.host.children[0];
  assert.ok(title.classList.contains("fpc-tobe-doc-title"));
  assert.equal(title.children.length, 0, "title has no children");
  assert.equal(title.textContent, "Production Plan Q3");
});

test("createTobeDocumentHost: no anchor → empty element dataset", () => {
  setupMockDom();
  const result = createTobeDocumentHost(fakeDoc({ anchorElementId: null }));
  assert.equal(result.host.dataset.fpcElementId, "");
});

test("createTobeDocumentHost: color sets the accent custom property", () => {
  setupMockDom();
  const result = createTobeDocumentHost(fakeDoc({ color: "#2563eb" }));
  assert.equal(result.host.style.getPropertyValue("--fpc-tobe-accent"), "#2563eb");
});

test("createTobeDocumentHost: very long titles are truncated", () => {
  setupMockDom();
  const long = "x".repeat(200);
  const result = createTobeDocumentHost(fakeDoc({ title: long }));
  const title = result.host.children[0];
  assert.ok(title.textContent.length <= 83, "title capped");
});

test("createTobeDocumentHost: empty doc still renders a host", () => {
  setupMockDom();
  const result = createTobeDocumentHost({});
  assert.ok(result && result.host);
  assert.deepEqual(result.position, { top: 0, left: 0 });
});
