// Срез fix/canvas-overlays-preferences-409 (F1) — новое поведение координатора:
// importXML → diagram.clear обязан инвалидировать sig-кэш elementOverlayMapRef,
// чтобы последующий mount восстанавливал оверлеи (audit H3, PLAN F1 п.1/п.4).

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
    count: (event) => (handlers[event] || []).length,
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

function makeCoordinator(previewMapRef, extra = {}) {
  return createV2OverlayCoordinator({
    enabledRef: { current: true },
    expandedRef: { current: false },
    useExtensionOverlaysRef: { current: true },
    previewMapRef,
    ...extra,
  });
}

function previewFor(ids) {
  const map = {};
  ids.forEach((id) => {
    map[id] = { enabled: true, elementId: id, items: [{ key: "priority", label: "priority", value: "high" }] };
  });
  return { current: map };
}

// Имитация importXML: Overlays-сервис очищает все ноды, затем diagram.clear.
function simulateImportClear(inst) {
  inst._overlays.store.length = 0;
  inst._eventBus.emit("diagram.clear", {});
}

test("diagram.clear invalidates coordinator cache: re-mount re-adds overlays with unchanged sig", () => {
  setupMockDom();
  const inst = fakeInst({ elements: [fakeElement("T1")] });
  const coordinator = makeCoordinator(previewFor(["T1"]));
  coordinator.mount(inst, "editor");
  assert.equal(inst._overlays.store.length, 1);

  simulateImportClear(inst);
  coordinator.mount(inst, "editor");

  assert.equal(inst._overlays.store.length, 1, "overlay must be re-added after diagram.clear + mount");
});

test("diagram.clear invalidates pending chunked mounts: no stale tail re-adds after clear", () => {
  setupMockDom();
  const elements = Array.from({ length: 30 }, (_, i) => fakeElement(`T${i}`));
  const inst = fakeInst({ elements });
  const coordinator = makeCoordinator(previewFor(elements.map((el) => el.id)));
  coordinator.mount(inst, "editor");
  // Не дожидаемся тейла чанкера — сразу имитируем re-import.
  simulateImportClear(inst);
  coordinator.mount(inst, "editor");
  // Повторный mount пересоздаёт все ноды; тейл предыдущего mount (до clear)
  // не должен доналожить дубли поверх.
  return new Promise((resolve) => setTimeout(resolve, 50)).then(() => {
    assert.equal(inst._overlays.store.length, 30, "no duplicate overlays from stale chunked tail");
  });
});

test("onDiagramClear callback fires so decor signature state can be reset", () => {
  setupMockDom();
  const inst = fakeInst({ elements: [fakeElement("T1")] });
  let calls = 0;
  const coordinator = makeCoordinator(previewFor(["T1"]), {
    onDiagramClear: () => { calls += 1; },
  });
  coordinator.mount(inst, "editor");
  simulateImportClear(inst);
  assert.equal(calls, 1, "onDiagramClear must fire on diagram.clear");
});

test("mount re-attaches overlay whose host left the DOM (idempotent replace by key)", () => {
  setupMockDom();
  const inst = fakeInst({ elements: [fakeElement("T1")] });
  const coordinator = makeCoordinator(previewFor(["T1"]));
  coordinator.mount(inst, "editor");
  assert.equal(inst._overlays.store.length, 1);

  // Ноды оверлеев убраны из DOM в обход Overlays-сервиса (host detached),
  // sig-кэш при этом жив. Mount обязан заменить запись, а не оставить тишину
  // и не наложить дубль.
  const host = inst._overlays.store[0].html;
  host.isConnected = false;
  coordinator.mount(inst, "editor");
  assert.equal(inst._overlays.store.length, 1, "exactly one overlay after replace");
  assert.notEqual(inst._overlays.store[0].html, host, "fresh host must replace detached one");
  assert.equal(inst._overlays.store[0].html.isConnected, true);
});

test("uninstall removes diagram.clear listener: no invalidation after uninstall (review minor#1)", () => {
  setupMockDom();
  const inst = fakeInst({ elements: [fakeElement("T1")] });
  let calls = 0;
  const coordinator = makeCoordinator(previewFor(["T1"]), {
    onDiagramClear: () => { calls += 1; },
  });
  coordinator.mount(inst, "editor");
  simulateImportClear(inst);
  assert.equal(calls, 1);

  coordinator.uninstall(inst);
  simulateImportClear(inst);
  assert.equal(calls, 1, "onDiagramClear must not fire after uninstall");
  assert.equal(inst._eventBus.count("diagram.clear"), 0, "diagram.clear listener must be removed from the bus");
});
