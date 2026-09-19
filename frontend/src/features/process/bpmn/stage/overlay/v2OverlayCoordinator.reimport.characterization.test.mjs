// Characterization среза fix/canvas-overlays-preferences-409 (F1).
//
// Фиксирует поведение КООРДИНАТОРА на событии diagram.clear (importXML):
// sig-кэш elementOverlayMapRef инвалидируется → повторный mount с
// неизменным contentSig восстанавливает оверлеи (audit H3, PLAN F1 п.1).
// Первый тест описывал pre-fix поведение (no-op, === 0) и обновлён коммитом
// фикса на пост-фикс ожидание (=== 1). Тест идемпотентности mount — инвариант,
// верный до и после фикса.

import assert from "node:assert/strict";
import test from "node:test";

import { createV2OverlayCoordinator } from "./v2OverlayCoordinator.js";

function createMockElement(tag) {
  const classList = new Set();
  const children = [];
  return {
    tagName: tag,
    isConnected: true,
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

function fakeInst({ elements = [] } = {}) {
  const eventBus = fakeEventBus();
  const overlays = fakeOverlays();
  const registry = {
    getAll: () => elements,
    get: (id) => elements.find((el) => el.id === id),
  };
  return {
    get: (name) => {
      if (name === "elementRegistry") return registry;
      if (name === "overlays") return overlays;
      if (name === "canvas") return { viewbox: () => ({ x: 0, y: 0, width: 1000, height: 1000 }) };
      if (name === "eventBus") return eventBus;
      return null;
    },
    _overlays: overlays,
    _eventBus: eventBus,
  };
}

function fakeElement(id) {
  return { id, type: "bpmn:Task", x: 0, y: 0, width: 100, height: 80, businessObject: { id, name: "Task", $type: "bpmn:Task" } };
}

function makeCoordinator(previewMapRef) {
  return createV2OverlayCoordinator({
    enabledRef: { current: true },
    expandedRef: { current: false },
    useExtensionOverlaysRef: { current: true },
    previewMapRef,
  });
}

// Имитация importXML: Overlays-сервис очищает все ноды (diagram-js
// Overlays.js подписан на diagram.clear), затем эмитится diagram.clear.
function simulateImportClear(inst) {
  inst._overlays.store.length = 0;
  inst._eventBus.emit("diagram.clear", {});
}

test("characterization (post-fix F1): mount after diagram.clear re-adds overlays with unchanged sig", () => {
  setupMockDom();
  const inst = fakeInst({ elements: [fakeElement("T1")] });
  const coordinator = makeCoordinator({
    current: {
      T1: { enabled: true, elementId: "T1", items: [{ key: "priority", label: "priority", value: "high" }] },
    },
  });
  coordinator.mount(inst, "editor");
  assert.equal(inst._overlays.store.length, 1);

  simulateImportClear(inst);
  coordinator.mount(inst, "editor");

  // POST-FIX (fix/canvas-overlays-preferences-409 F1): diagram.clear
  // инвалидирует sig-кэш elementOverlayMapRef → mount заново создаёт
  // overlay-ноду. До фикса ожидание было === 0 (audit H3 §3).
  assert.equal(inst._overlays.store.length, 1);
});

test("characterization (invariant): repeated mount without clear does not duplicate overlays", () => {
  setupMockDom();
  const inst = fakeInst({ elements: [fakeElement("T1")] });
  const coordinator = makeCoordinator({
    current: {
      T1: { enabled: true, elementId: "T1", items: [{ key: "priority", label: "priority", value: "high" }] },
    },
  });
  coordinator.mount(inst, "editor");
  coordinator.mount(inst, "editor");
  coordinator.mount(inst, "editor");
  assert.equal(inst._overlays.store.length, 1);
});
