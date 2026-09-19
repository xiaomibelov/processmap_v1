// Срез fix/overlay-crash-regression-1000 (P0, регрессия #1000) — сценарий A3:
// recover3 (viewportRecovery.recoverByHardReset) зовёт diagram.destroy БЕЗ
// инвалидации overlay-координатора: diagram.destroy не фигачит diagram.clear,
// поэтому не-awaited chunked tail mount (v2OverlayCoordinator mount >12 записей)
// продолжает класть overlays.add на уничтоженный инстанс → TypeError reading
// 'length' (Canvas._planes удалён Canvas._destroy подписчиком diagram.destroy).

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
          return classList.has(cls);
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

// Имитация recover3: Diagram.destroy фигачит ТОЛЬКО 'diagram.destroy'
// (Canvas._planes удаляется своим подписчиком) — 'diagram.clear' НЕ эмитится.
function simulateDestroy(inst) {
  inst._eventBus.emit("diagram.destroy", {});
}

test("A3: diagram.destroy during pending chunked tail — no stale overlays.add on destroyed instance", () => {
  setupMockDom();
  const elements = Array.from({ length: 30 }, (_, i) => fakeElement(`T${i}`));
  const inst = fakeInst({ elements });
  const coordinator = makeCoordinator(previewFor(elements.map((el) => el.id)));
  coordinator.mount(inst, "editor");
  assert.equal(inst._overlays.store.length, 12, "head chunk mounted synchronously");

  // recover3 destroy посреди не-awaited tail (409 → recovery → recoverByHardReset).
  simulateDestroy(inst);

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        assert.equal(
          inst._overlays.store.length,
          12,
          "stale chunked tail must not call overlays.add after diagram.destroy",
        );
        resolve();
      } catch (err) {
        reject(err);
      }
    }, 50);
  });
});

test("destroy → new-mount cycle: fresh instance mounts fully, double destroy is a no-op", () => {
  setupMockDom();
  const elements = Array.from({ length: 30 }, (_, i) => fakeElement(`T${i}`));
  const ids = elements.map((el) => el.id);
  const instA = fakeInst({ elements });
  const coordinator = makeCoordinator(previewFor(ids));
  coordinator.mount(instA, "editor");
  simulateDestroy(instA);
  simulateDestroy(instA);

  const instB = fakeInst({ elements });
  coordinator.mount(instB, "editor");

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        assert.equal(instB._overlays.store.length, 30, "fresh instance must receive the full mount");
        assert.equal(instA._overlays.store.length, 12, "destroyed instance untouched by the new mount and by its own stale tail");
        resolve();
      } catch (err) {
        reject(err);
      }
    }, 50);
  });
});

test("onDiagramClear hook fires on diagram.destroy so decor signature state resets", () => {
  setupMockDom();
  const inst = fakeInst({ elements: [fakeElement("T1")] });
  let calls = 0;
  const coordinator = makeCoordinator(previewFor(["T1"]), {
    onDiagramClear: () => { calls += 1; },
  });
  coordinator.mount(inst, "editor");
  simulateDestroy(inst);
  assert.equal(calls, 1, "onDiagramClear must fire on diagram.destroy");
});

test("A3 (viewer kind): diagram.destroy during pending chunked tail — no stale overlays.add on destroyed viewer", () => {
  setupMockDom();
  const elements = Array.from({ length: 30 }, (_, i) => fakeElement(`T${i}`));
  const inst = fakeInst({ elements });
  const coordinator = makeCoordinator(previewFor(elements.map((el) => el.id)));
  coordinator.mount(inst, "viewer");
  assert.equal(inst._overlays.store.length, 12, "head chunk mounted synchronously");

  simulateDestroy(inst);

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        assert.equal(
          inst._overlays.store.length,
          12,
          "stale chunked tail must not call overlays.add after viewer diagram.destroy",
        );
        resolve();
      } catch (err) {
        reject(err);
      }
    }, 50);
  });
});

test("uninstall removes the diagram.destroy listener too", () => {
  setupMockDom();
  const inst = fakeInst({ elements: [fakeElement("T1")] });
  let calls = 0;
  const coordinator = makeCoordinator(previewFor(["T1"]), {
    onDiagramClear: () => { calls += 1; },
  });
  coordinator.mount(inst, "editor");
  coordinator.uninstall(inst);
  simulateDestroy(inst);
  assert.equal(calls, 0, "onDiagramClear must not fire after uninstall");
  assert.equal(inst._eventBus.count("diagram.destroy"), 0, "diagram.destroy listener must be removed from the bus");
});
