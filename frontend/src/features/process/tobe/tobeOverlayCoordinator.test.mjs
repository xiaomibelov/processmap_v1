import assert from "node:assert/strict";
import test from "node:test";

import { createTobeOverlayCoordinator } from "./tobeOverlayCoordinator.js";

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

function fakeOverlays() {
  const store = [];
  return {
    store,
    get: ({ element }) => store.filter((e) => e.elementId === element),
    add: (elementId, { html }) => {
      const id = `overlay_${store.length}`;
      store.push({ id, elementId, html });
      return id;
    },
    remove: (id) => {
      const idx = store.findIndex((e) => e.id === id);
      if (idx >= 0) store.splice(idx, 1);
    },
  };
}

function fakeInst({ elements = [], overlays = fakeOverlays(), viewbox = null } = {}) {
  const registry = {
    getAll: () => elements,
    get: (id) => elements.find((el) => el.id === id),
  };
  const canvas = {
    viewbox: () => viewbox || { x: -10000, y: -10000, width: 20000, height: 20000 },
    getRootElement: () => ({ id: "root_process" }),
  };
  return {
    get: (name) => {
      if (name === "elementRegistry") return registry;
      if (name === "overlays") return overlays;
      if (name === "canvas") return canvas;
      return null;
    },
    _overlays: overlays,
  };
}

function fakeElement(id) {
  return { id, type: "bpmn:Task", x: 0, y: 0, width: 100, height: 80 };
}

function fakeDoc(id, overrides = {}) {
  return {
    id,
    anchorElementId: "T1",
    x: 10,
    y: 10,
    title: `Doc ${id}`,
    url: "",
    docId: "",
    color: null,
    visible: true,
    ...overrides,
  };
}

async function flushFrames(callbacks) {
  // Each drained rAF callback lets one chunk continue; a setImmediate turn
  // lets the async loop reach its next await before we drain again.
  while (callbacks.length) {
    const cb = callbacks.shift();
    cb();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test("coordinator mount adds overlays for visible docs only", () => {
  setupMockDom();
  const inst = fakeInst({ elements: [fakeElement("T1")] });
  const coordinator = createTobeOverlayCoordinator({ enabledRef: { current: true } });
  coordinator.mount(inst, "editor", [
    fakeDoc("d1"),
    fakeDoc("d2", { visible: false }),
    fakeDoc("d3", { anchorElementId: null }),
  ]);
  assert.equal(inst._overlays.store.length, 2);
  const elementIds = inst._overlays.store.map((entry) => entry.elementId).sort();
  assert.deepEqual(elementIds, ["T1", "root_process"], "anchored doc on element, free doc on root");
});

test("coordinator mount is a no-op while the layer is disabled", () => {
  setupMockDom();
  const inst = fakeInst({ elements: [fakeElement("T1")] });
  const coordinator = createTobeOverlayCoordinator({ enabledRef: { current: false } });
  coordinator.mount(inst, "editor", [fakeDoc("d1")]);
  assert.equal(inst._overlays.store.length, 0);
});

test("coordinator clear removes all mounted doc overlays", () => {
  setupMockDom();
  const inst = fakeInst({ elements: [fakeElement("T1")] });
  const coordinator = createTobeOverlayCoordinator({ enabledRef: { current: true } });
  coordinator.mount(inst, "editor", [fakeDoc("d1"), fakeDoc("d2")]);
  assert.equal(inst._overlays.store.length, 2);
  coordinator.clear(inst, "editor");
  assert.equal(inst._overlays.store.length, 0);
});

test("coordinator remount replaces stale overlays instead of duplicating", () => {
  setupMockDom();
  const inst = fakeInst({ elements: [fakeElement("T1")] });
  const coordinator = createTobeOverlayCoordinator({ enabledRef: { current: true } });
  coordinator.mount(inst, "editor", [fakeDoc("d1")]);
  coordinator.mount(inst, "editor", [fakeDoc("d2")]);
  assert.equal(inst._overlays.store.length, 1);
  assert.equal(inst._overlays.store[0].html.dataset.fpcTobeDocId, "d2");
});

test("coordinator chunks mounts larger than 12 across frames", async () => {
  setupMockDom();
  const rafCallbacks = [];
  const prevRaf = globalThis.requestAnimationFrame;
  const prevScheduler = globalThis.scheduler;
  globalThis.requestAnimationFrame = (cb) => { rafCallbacks.push(cb); };
  delete globalThis.scheduler;
  try {
    const inst = fakeInst({ elements: [fakeElement("T1")] });
    const coordinator = createTobeOverlayCoordinator({ enabledRef: { current: true } });
    const docs = Array.from({ length: 30 }, (_, idx) => fakeDoc(`d${idx}`));
    coordinator.mount(inst, "editor", docs);
    assert.equal(inst._overlays.store.length, 12, "first chunk mounts synchronously");
    await flushFrames(rafCallbacks);
    assert.equal(inst._overlays.store.length, 30, "remaining chunks mounted across frames");
  } finally {
    if (prevRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = prevRaf;
    if (prevScheduler === undefined) delete globalThis.scheduler;
    else globalThis.scheduler = prevScheduler;
  }
});

test("coordinator viewport culling skips docs outside the viewbox margin", () => {
  setupMockDom();
  const inst = fakeInst({
    elements: [fakeElement("T1")],
    viewbox: { x: 0, y: 0, width: 500, height: 500 },
  });
  const coordinator = createTobeOverlayCoordinator({ enabledRef: { current: true } });
  coordinator.mount(inst, "editor", [
    fakeDoc("near", { anchorElementId: null, x: 100, y: 100 }),
    fakeDoc("edge", { anchorElementId: null, x: 650, y: 650 }),
    fakeDoc("far", { anchorElementId: null, x: 5000, y: 5000 }),
  ]);
  const ids = inst._overlays.store.map((entry) => entry.html.dataset.fpcTobeDocId).sort();
  assert.deepEqual(ids, ["edge", "near"], "doc outside viewbox+200px margin is culled");
});

test("coordinator epoch token cancels stale chunks on remount", async () => {
  setupMockDom();
  const rafCallbacks = [];
  const prevRaf = globalThis.requestAnimationFrame;
  const prevScheduler = globalThis.scheduler;
  globalThis.requestAnimationFrame = (cb) => { rafCallbacks.push(cb); };
  delete globalThis.scheduler;
  try {
    const inst = fakeInst({ elements: [fakeElement("T1")] });
    const coordinator = createTobeOverlayCoordinator({ enabledRef: { current: true } });
    const docs = Array.from({ length: 30 }, (_, idx) => fakeDoc(`a${idx}`));
    coordinator.mount(inst, "editor", docs);
    assert.equal(inst._overlays.store.length, 12);
    // Remount with a single doc before the frames drain: stale tail of the
    // first mount must not mount after the newer mount.
    coordinator.mount(inst, "editor", [fakeDoc("b1")]);
    assert.equal(inst._overlays.store.length, 1);
    await flushFrames(rafCallbacks);
    assert.equal(inst._overlays.store.length, 1);
    assert.equal(inst._overlays.store[0].html.dataset.fpcTobeDocId, "b1");
  } finally {
    if (prevRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = prevRaf;
    if (prevScheduler === undefined) delete globalThis.scheduler;
    else globalThis.scheduler = prevScheduler;
  }
});
