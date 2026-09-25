// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { setLocale } from "../../../../../shared/i18n/index.js";
import { initProvenanceHighlight } from "./tobeProvenanceHighlight.js";

// T9: прямая подсветка provenance — selection TO BE-элемента → маркеры-предки
// на ghost-подложке + dim-режим. T10: обратная подсветка (клик по ghost) →
// linked-маркеры на TO BE + бейдж N→1. Фейки — по реальному контракту
// diagram-js (eventBus on/off, canvas.addMarker/removeMarker, overlays.add/
// remove, registry.get/forEach): внутренности diagram-js не мокаем (урок C1).
// ЖЁСТКИЙ ИНВАРИАНТ: read-only — только addMarker/removeMarker/overlays/eventBus.

function makeFakeEventBus() {
  const listeners = new Map();
  return {
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(cb);
    },
    off(event, cb) {
      const list = listeners.get(event) || [];
      listeners.set(event, list.filter((x) => x !== cb));
    },
    emit(event, payload) {
      for (const cb of [...(listeners.get(event) || [])]) cb(payload);
    },
    listenerCount(event) {
      return (listeners.get(event) || []).length;
    },
  };
}

function makeFakeCanvas({ container } = {}) {
  const api = {
    addMarkerCalls: [],
    removeMarkerCalls: [],
    viewbox: () => ({ x: 0, y: 0, width: 1000, height: 1000, scale: 1 }),
    getContainer: () => container,
    addMarker(id, cls) {
      api.addMarkerCalls.push([id, cls]);
    },
    removeMarker(id, cls) {
      api.removeMarkerCalls.push([id, cls]);
    },
  };
  return api;
}

function makeFakeOverlays() {
  const api = {
    addCalls: [],
    removeCalls: [],
    seq: 0,
    add(element, type, descriptor) {
      api.addCalls.push({ element, type, descriptor });
      const overlay = { id: `ov-${(api.seq += 1)}`, element, type };
      return overlay;
    },
    remove(overlay) {
      api.removeCalls.push(overlay);
    },
  };
  return api;
}

// registry по контракту diagram-js: get(id) | forEach(cb) по элементам с di.bounds.
function makeFakeRegistry(elements) {
  // elements: Map<id, {x,y,width,height}>
  return {
    get: (id) => (elements.has(id) ? { id, businessObject: { di: { bounds: elements.get(id) } } } : null),
    forEach: (cb) => {
      for (const [id, bounds] of elements) {
        cb({ id, businessObject: { di: { bounds } } });
      }
    },
  };
}

function makeIndex() {
  const forward = new Map([
    ["Task_a", { asIsIds: ["AsIs_1", "AsIs_2"], fate: "transformed_to", ruleId: "R02_merge" }],
    ["Task_b", { asIsIds: ["AsIs_3"], fate: "transformed_to", ruleId: "R01_move" }],
  ]);
  const reverse = new Map([
    ["AsIs_1", [{ toBeId: "Task_a", fate: "transformed_to", ruleId: "R02_merge" }]],
    ["AsIs_2", [{ toBeId: "Task_a", fate: "transformed_to", ruleId: "R02_merge" }]],
    ["AsIs_3", [{ toBeId: "Task_b", fate: "transformed_to", ruleId: "R01_move" }]],
  ]);
  return { forward, reverse, source: "both" };
}

function setup({ ghostElements, editorElements } = {}) {
  const eventBus = makeFakeEventBus();
  const editorContainer = document.createElement("div");
  const editorCanvas = makeFakeCanvas({ container: editorContainer });
  const editorOverlays = makeFakeOverlays();
  const editorRegistry = makeFakeRegistry(new Map([...(editorElements || [["Task_a"], ["Task_b"]]).map((e) => [Array.isArray(e) ? e[0] : e, { x: 0, y: 0, width: 10, height: 10 }])]));
  const ghostRegistry = makeFakeRegistry(new Map(ghostElements || [["AsIs_1", { x: 0, y: 0, width: 100, height: 50 }], ["AsIs_2", { x: 200, y: 0, width: 100, height: 50 }], ["AsIs_3", { x: 400, y: 0, width: 100, height: 50 }]]));
  const ghostCanvas = makeFakeCanvas({});
  const ghostContainer = document.createElement("div");
  ghostContainer.className = "tobeOverlayUnderlay-canvas";
  const index = makeIndex();
  const highlight = initProvenanceHighlight({
    editorCanvas,
    editorEventBus: eventBus,
    editorOverlays,
    editorRegistry,
    getGhostRegistry: () => ({ registry: ghostRegistry, canvas: ghostCanvas }),
    getIndex: () => index,
    ghostContainer,
  });
  return { highlight, eventBus, editorCanvas, editorOverlays, editorContainer, ghostCanvas, ghostContainer };
}

function click(container, { x, y, target = null } = {}) {
  const opts = { bubbles: true, clientX: x, clientY: y };
  container.dispatchEvent(new MouseEvent("pointerdown", opts));
  (target || container).dispatchEvent(new MouseEvent("pointerup", opts));
}

beforeEach(() => {
  setLocale("ru");
});

describe("T9: прямая подсветка (selection → предки на ghost + dim)", () => {
  it("selection с записью в forward: маркеры ровно на asIsIds + класс provenance-dim", () => {
    const { eventBus, ghostCanvas, ghostContainer } = setup();
    eventBus.emit("selection.changed", { newSelection: [{ id: "Task_a" }] });
    expect(ghostCanvas.addMarkerCalls).toEqual([["AsIs_1", "tobeProvAncestor"], ["AsIs_2", "tobeProvAncestor"]]);
    expect(ghostContainer.classList.contains("provenance-dim")).toBe(true);
  });

  it("смена selection: прошлые маркеры/класс сняты, новые применены", () => {
    const { eventBus, ghostCanvas, ghostContainer } = setup();
    eventBus.emit("selection.changed", { newSelection: [{ id: "Task_a" }] });
    ghostCanvas.addMarkerCalls.length = 0;
    eventBus.emit("selection.changed", { newSelection: [{ id: "Task_b" }] });
    expect(ghostCanvas.removeMarkerCalls).toEqual([["AsIs_1", "tobeProvAncestor"], ["AsIs_2", "tobeProvAncestor"]]);
    expect(ghostCanvas.addMarkerCalls).toEqual([["AsIs_3", "tobeProvAncestor"]]);
    expect(ghostContainer.classList.contains("provenance-dim")).toBe(true);
  });

  it("пустой selection (клик мимо): всё снято — маркеры и dim", () => {
    const { eventBus, ghostCanvas, ghostContainer } = setup();
    eventBus.emit("selection.changed", { newSelection: [{ id: "Task_a" }] });
    ghostCanvas.removeMarkerCalls.length = 0;
    eventBus.emit("selection.changed", { newSelection: [] });
    expect(ghostCanvas.removeMarkerCalls).toEqual([["AsIs_1", "tobeProvAncestor"], ["AsIs_2", "tobeProvAncestor"]]);
    expect(ghostContainer.classList.contains("provenance-dim")).toBe(false);
  });

  it("элемент без записи в forward: молча — без маркеров и без dim (empty-state — T11)", () => {
    const { eventBus, ghostCanvas, ghostContainer } = setup();
    eventBus.emit("selection.changed", { newSelection: [{ id: "Task_manual" }] });
    expect(ghostCanvas.addMarkerCalls).toEqual([]);
    expect(ghostContainer.classList.contains("provenance-dim")).toBe(false);
  });

  it("asIsId без элемента в ghost-registry: маркер не ставится (ровно существующие)", () => {
    const { eventBus, ghostCanvas } = setup({
      ghostElements: [["AsIs_1", { x: 0, y: 0, width: 100, height: 50 }]],
    });
    eventBus.emit("selection.changed", { newSelection: [{ id: "Task_a" }] });
    expect(ghostCanvas.addMarkerCalls).toEqual([["AsIs_1", "tobeProvAncestor"]]);
  });

  it("destroy: eventBus.off вызван, маркеры/класс сняты, emit после destroy — no-op", () => {
    const bus = makeFakeEventBus();
    const baseline = bus.listenerCount("selection.changed");
    const ghostCanvas = makeFakeCanvas({});
    const ghostContainer = document.createElement("div");
    const highlight = initProvenanceHighlight({
      editorCanvas: makeFakeCanvas({ container: document.createElement("div") }),
      editorEventBus: bus,
      getGhostRegistry: () => ({
        registry: makeFakeRegistry(new Map([["AsIs_1", { x: 0, y: 0, width: 100, height: 50 }], ["AsIs_2", { x: 200, y: 0, width: 100, height: 50 }]])),
        canvas: ghostCanvas,
      }),
      getIndex: () => makeIndex(),
      ghostContainer,
    });
    expect(bus.listenerCount("selection.changed")).toBe(baseline + 1);
    bus.emit("selection.changed", { newSelection: [{ id: "Task_a" }] });
    highlight.destroy();
    expect(bus.listenerCount("selection.changed")).toBe(baseline);
    expect(ghostCanvas.removeMarkerCalls.length).toBe(2);
    expect(ghostContainer.classList.contains("provenance-dim")).toBe(false);
    ghostCanvas.removeMarkerCalls.length = 0;
    ghostCanvas.addMarkerCalls.length = 0;
    bus.emit("selection.changed", { newSelection: [{ id: "Task_a" }] });
    expect(ghostCanvas.addMarkerCalls).toEqual([]);
  });

  it("listener-flat: 20 циклов init/destroy — счётчик selection.changed на baseline", () => {
    const eventBus = makeFakeEventBus();
    const baseline = eventBus.listenerCount("selection.changed");
    for (let i = 0; i < 20; i += 1) {
      const editorContainer = document.createElement("div");
      const h = initProvenanceHighlight({
        editorCanvas: makeFakeCanvas({ container: editorContainer }),
        editorEventBus: eventBus,
        getGhostRegistry: () => null,
        getIndex: () => null,
        ghostContainer: document.createElement("div"),
      });
      expect(eventBus.listenerCount("selection.changed")).toBe(baseline + 1);
      h.destroy();
      expect(eventBus.listenerCount("selection.changed")).toBe(baseline);
    }
  });
});
