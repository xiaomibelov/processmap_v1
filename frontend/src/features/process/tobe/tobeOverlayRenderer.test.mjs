import assert from "node:assert/strict";
import test from "node:test";

import { createTobeDocumentHost, createTobeGhostHost } from "./tobeOverlayRenderer.js";

function createMockElement(tag, { rect = null } = {}) {
  const classList = new Set();
  const children = [];
  const listeners = new Map();
  return {
    tagName: tag,
    classList: {
      add: (cls) => classList.add(cls),
      remove: (cls) => classList.delete(cls),
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
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatch: (type, event = {}) => {
      (listeners.get(type) || []).forEach((fn) => fn({
        preventDefault: () => {},
        stopPropagation: () => {},
        button: 0,
        ...event,
      }));
    },
    setPointerCapture: () => {},
    getBoundingClientRect: rect ? () => rect : undefined,
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
    width: 240,
    height: 160,
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

test("createTobeDocumentHost: three DOM nodes (host + header + snippet)", () => {
  setupMockDom();
  const result = createTobeDocumentHost(fakeDoc());
  assert.equal(result.host.children.length, 2, "host has header + snippet only");
  const [header, snippet] = result.host.children;
  assert.ok(header.classList.contains("fpc-tobe-doc-header"));
  assert.ok(snippet.classList.contains("fpc-tobe-doc-snippet"));
  assert.equal(header.children.length, 0, "header has no children");
  assert.equal(snippet.children.length, 0, "snippet has no children");
  assert.equal(header.textContent, "Production Plan Q3");
});

test("createTobeDocumentHost: snippet falls back to placeholder text", () => {
  setupMockDom();
  const result = createTobeDocumentHost(fakeDoc());
  const snippet = result.host.children[1];
  assert.ok(snippet.textContent.length > 0, "placeholder shown without a snippet");
  const withSnippet = createTobeDocumentHost(fakeDoc({ snippet: "Q3 targets and capacity" }));
  assert.equal(withSnippet.host.children[1].textContent, "Q3 targets and capacity");
});

test("createTobeDocumentHost: per-record size is applied inline, defaults otherwise", () => {
  setupMockDom();
  const sized = createTobeDocumentHost(fakeDoc({ width: 320, height: 220 }));
  assert.equal(sized.host.style.getPropertyValue("width"), "320px");
  assert.equal(sized.host.style.getPropertyValue("height"), "220px");
  const legacy = createTobeDocumentHost(fakeDoc({ width: undefined, height: undefined }));
  assert.equal(legacy.host.style.getPropertyValue("width"), "240px");
  assert.equal(legacy.host.style.getPropertyValue("height"), "160px");
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
  const header = result.host.children[0];
  assert.ok(header.textContent.length <= 83, "title capped");
});

test("createTobeDocumentHost: empty doc still renders a host", () => {
  setupMockDom();
  const result = createTobeDocumentHost({});
  assert.ok(result && result.host);
  assert.deepEqual(result.position, { top: 0, left: 0 });
});

const CARD_RECT = { left: 500, top: 300, right: 740, bottom: 460, width: 240, height: 160 };

function createInteractiveHost(docOverrides = {}, { onCommit, getScale } = {}) {
  setupMockDom();
  const commits = [];
  const result = createTobeDocumentHost(fakeDoc(docOverrides), {
    getScale: getScale || (() => 1),
    onCommit: onCommit || ((patch) => commits.push(patch)),
  });
  // Swap in a host that carries a bounding rect for hit-zone math while
  // keeping the listeners the renderer attached.
  const hostWithRect = result.host;
  hostWithRect.getBoundingClientRect = () => CARD_RECT;
  return { host: hostWithRect, commits };
}

test("interactions: drag commits x/y only on pointerup", () => {
  const { host, commits } = createInteractiveHost();
  host.dispatch("pointerdown", { clientX: 600, clientY: 350, pointerId: 1 });
  host.dispatch("pointermove", { clientX: 640, clientY: 380 });
  assert.equal(host.style.getPropertyValue("transform"), "translate(40px, 30px)");
  assert.equal(commits.length, 0, "no commit during drag");
  host.dispatch("pointerup", { clientX: 640, clientY: 380 });
  assert.deepEqual(commits, [{ x: 140, y: 80 }]);
});

test("interactions: drag delta respects canvas zoom", () => {
  const { host, commits } = createInteractiveHost({}, { getScale: () => 2 });
  host.dispatch("pointerdown", { clientX: 600, clientY: 350, pointerId: 1 });
  host.dispatch("pointermove", { clientX: 660, clientY: 390 });
  assert.equal(host.style.getPropertyValue("transform"), "translate(30px, 20px)");
  host.dispatch("pointerup", { clientX: 660, clientY: 390 });
  assert.deepEqual(commits, [{ x: 130, y: 70 }]);
});

test("interactions: tiny movement stays a click (no commit)", () => {
  const { host, commits } = createInteractiveHost();
  host.dispatch("pointerdown", { clientX: 600, clientY: 350, pointerId: 1 });
  host.dispatch("pointermove", { clientX: 601, clientY: 352 });
  host.dispatch("pointerup", { clientX: 601, clientY: 352 });
  assert.equal(commits.length, 0);
});

test("interactions: bottom-right grip resizes with min clamp, commits on end", () => {
  const { host, commits } = createInteractiveHost();
  host.dispatch("pointerdown", { clientX: 735, clientY: 455, pointerId: 1 });
  host.dispatch("pointermove", { clientX: 775, clientY: 495 });
  assert.equal(host.style.getPropertyValue("width"), "280px");
  assert.equal(host.style.getPropertyValue("height"), "200px");
  host.dispatch("pointerup", { clientX: 775, clientY: 495 });
  assert.deepEqual(commits, [{ width: 280, height: 200 }]);
});

test("interactions: resize clamps to the minimum size", () => {
  const { host, commits } = createInteractiveHost();
  host.dispatch("pointerdown", { clientX: 735, clientY: 455, pointerId: 1 });
  host.dispatch("pointermove", { clientX: 550, clientY: 320 });
  host.dispatch("pointerup", { clientX: 550, clientY: 320 });
  assert.deepEqual(commits, [{ width: 160, height: 100 }]);
});

test("interactions: top-right close zone hides the shape", () => {
  const { host, commits } = createInteractiveHost();
  host.dispatch("pointerdown", { clientX: 735, clientY: 305, pointerId: 1 });
  assert.deepEqual(commits, [{ visible: false }]);
});

test("createTobeGhostHost: ghost classes, no datasets, default size", () => {
  setupMockDom();
  const result = createTobeGhostHost({ title: "New doc" });
  assert.ok(result && result.host);
  assert.ok(result.host.classList.contains("fpc-tobe-doc"));
  assert.ok(result.host.classList.contains("fpc-tobe-doc-ghost"));
  assert.equal(result.host.dataset.fpcTobeDocId, undefined);
  assert.equal(result.host.style.getPropertyValue("width"), "240px");
  assert.equal(result.host.children[0].textContent, "New doc");
});
