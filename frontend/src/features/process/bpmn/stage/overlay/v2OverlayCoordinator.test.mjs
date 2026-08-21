import assert from "node:assert/strict";
import test from "node:test";

import { createV2OverlayCoordinator } from "./v2OverlayCoordinator.js";

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

function fakeEventBus() {
  const handlers = {};
  return {
    on: (event, fn) => {
      handlers[event] = handlers[event] || [];
      handlers[event].push(fn);
    },
    off: (event, fn) => {
      handlers[event] = (handlers[event] || []).filter((f) => f !== fn);
    },
    emit: (event, payload) => {
      (handlers[event] || []).forEach((fn) => fn(payload));
    },
  };
}

function fakeCanvas() {
  return {
    viewbox: () => ({ x: 0, y: 0, width: 1000, height: 1000 }),
  };
}

function fakeInst({ elements = [], overlays = fakeOverlays() } = {}) {
  const eventBus = fakeEventBus();
  const registry = {
    getAll: () => elements,
    get: (id) => elements.find((el) => el.id === id),
  };
  return {
    get: (name) => {
      if (name === "elementRegistry") return registry;
      if (name === "overlays") return overlays;
      if (name === "canvas") return fakeCanvas();
      if (name === "eventBus") return eventBus;
      return null;
    },
    _overlays: overlays,
    _eventBus: eventBus,
  };
}

function fakeElement(id, name = "", type = "bpmn:Task") {
  return { id, type, x: 0, y: 0, width: 100, height: 80, businessObject: { id, name, $type: type } };
}

function fakeElementWithProperties(id, props) {
  return {
    id,
    type: "bpmn:Task",
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    businessObject: {
      id,
      name: "Task",
      $type: "bpmn:Task",
      extensionElements: {
        values: [{
          $type: "camunda:Properties",
          values: props.map(([name, value]) => ({ name, value })),
        }],
      },
    },
  };
}

test("coordinator mount renders overlay for preview-only element", () => {
  setupMockDom();
  const inst = fakeInst({ elements: [fakeElement("T1", "Task")] });
  const previewMapRef = {
    current: {
      T1: { enabled: true, elementId: "T1", items: [{ key: "priority", label: "priority", value: "high" }] },
    },
  };
  const coordinator = createV2OverlayCoordinator({
    enabledRef: { current: true },
    expandedRef: { current: false },
    useExtensionOverlaysRef: { current: true },
    previewMapRef,
  });
  coordinator.mount(inst, "editor");
  assert.equal(inst._overlays.store.length, 1);
});

test("coordinator mount suppresses overlay when preview entry is empty in per-element mode", () => {
  setupMockDom();
  const inst = fakeInst({ elements: [fakeElement("T1", "Task")] });
  const previewMapRef = {
    current: {
      T1: { enabled: false, elementId: "T1", items: [] },
    },
  };
  const coordinator = createV2OverlayCoordinator({
    enabledRef: { current: false },
    expandedRef: { current: false },
    useExtensionOverlaysRef: { current: true },
    previewMapRef,
  });
  coordinator.mount(inst, "editor");
  assert.equal(inst._overlays.store.length, 0);
});

test("coordinator mount keeps BPMN fallback when preview entry is empty in global mode", () => {
  setupMockDom();
  const inst = fakeInst({ elements: [fakeElement("T1", "Task")] });
  const previewMapRef = {
    current: {
      T1: { enabled: false, elementId: "T1", items: [] },
    },
  };
  const coordinator = createV2OverlayCoordinator({
    enabledRef: { current: true },
    expandedRef: { current: false },
    useExtensionOverlaysRef: { current: true },
    previewMapRef,
  });
  coordinator.mount(inst, "editor");
  // Global V2 mode: an empty/disabled selection preview must not suppress the
  // element's own BPMN-derived card (name-only fallback for a named task).
  assert.equal(inst._overlays.store.length, 1);
});

test("coordinator mount keeps overlay when preview becomes empty in global mode", () => {
  setupMockDom();
  const inst = fakeInst({ elements: [fakeElement("T1", "Task")] });
  const previewMapRef = {
    current: {
      T1: { enabled: true, elementId: "T1", items: [{ key: "priority", label: "priority", value: "high" }] },
    },
  };
  const coordinator = createV2OverlayCoordinator({
    enabledRef: { current: true },
    expandedRef: { current: false },
    useExtensionOverlaysRef: { current: true },
    previewMapRef,
  });
  coordinator.mount(inst, "editor");
  assert.equal(inst._overlays.store.length, 1);

  previewMapRef.current = { T1: { enabled: false, elementId: "T1", items: [] } };
  coordinator.mount(inst, "editor");
  // Selecting an element (which empties/disables its preview entry) must not
  // remove the V2 overlay while global V2 rendering is enabled.
  assert.equal(inst._overlays.store.length, 1);
});

test("coordinator mountFromBpmn applies hiddenFields to BPMN-derived auto cards", () => {
  setupMockDom();
  const inst = fakeInst({
    elements: [fakeElementWithProperties("T1", [["ee_time", "0.33"], ["ingredient_value", "5"]])],
  });
  const coordinator = createV2OverlayCoordinator({
    enabledRef: { current: true },
    expandedRef: { current: false },
    useExtensionOverlaysRef: { current: true },
    previewMapRef: { current: {} },
    hiddenFieldsRef: { current: ["ee_time"] },
  });
  coordinator.mountFromBpmn(inst, "editor");
  assert.equal(inst._overlays.store.length, 1);
  const hostDump = JSON.stringify(inst._overlays.store[0].html);
  assert.ok(!hostDump.includes("0.33"), "hidden field value must not render");
  assert.ok(hostDump.includes("5"), "visible field must stay");
});

test("coordinator mountFromBpmn drops auto card when every field is hidden, keeps name-only card", () => {
  setupMockDom();
  const inst = fakeInst({
    elements: [
      fakeElementWithProperties("T1", [["ee_time", "0.33"]]),
      fakeElement("T2", "Named task"),
    ],
  });
  const coordinator = createV2OverlayCoordinator({
    enabledRef: { current: true },
    expandedRef: { current: false },
    useExtensionOverlaysRef: { current: true },
    previewMapRef: { current: {} },
    hiddenFieldsRef: { current: ["ee_time"] },
  });
  coordinator.mountFromBpmn(inst, "editor");
  const elementIds = inst._overlays.store.map((entry) => entry.elementId).sort();
  assert.deepEqual(elementIds, ["T2"], "fully-hidden auto card dropped; name-only card kept");
});
