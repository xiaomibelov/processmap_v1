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

function setup({ ghostElements, editorElements, index: customIndex } = {}) {
  const eventBus = makeFakeEventBus();
  const editorContainer = document.createElement("div");
  const editorCanvas = makeFakeCanvas({ container: editorContainer });
  const editorOverlays = makeFakeOverlays();
  const editorRegistry = makeFakeRegistry(new Map([...(editorElements || [["Task_a"], ["Task_b"]]).map((e) => [Array.isArray(e) ? e[0] : e, { x: 0, y: 0, width: 10, height: 10 }])]));
  const ghostRegistry = makeFakeRegistry(new Map(ghostElements || [["AsIs_1", { x: 0, y: 0, width: 100, height: 50 }], ["AsIs_2", { x: 200, y: 0, width: 100, height: 50 }], ["AsIs_3", { x: 400, y: 0, width: 100, height: 50 }]]));
  const ghostCanvas = makeFakeCanvas({});
  const ghostContainer = document.createElement("div");
  ghostContainer.className = "tobeOverlayUnderlay-canvas";
  const index = customIndex || makeIndex();
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

describe("T10: обратная подсветка (клик по ghost → linked TO BE + бейдж N→1)", () => {
  it("клик БЕЗ drag по ghost-элементу: linked-маркеры, ancestor на ghost, бейдж с формой текста", () => {
    const { editorCanvas, editorOverlays, editorContainer, ghostCanvas } = setup();
    click(editorContainer, { x: 450, y: 10 }); // внутри rect AsIs_3 (x=400..500)
    expect(editorCanvas.addMarkerCalls).toEqual([["Task_b", "tobeProvLinked"]]);
    expect(ghostCanvas.addMarkerCalls).toEqual([["AsIs_3", "tobeProvAncestor"]]);
    expect(editorOverlays.addCalls.length).toBe(1);
    const badge = editorOverlays.addCalls[0];
    expect(badge.element).toBe("Task_b");
    expect(badge.type).toBe("tobe-prov-badge");
    expect(badge.descriptor.position).toEqual({ top: -14, left: 0 });
    // n = reverse.get(ghostId).length = 1 → badgeOne.
    expect(badge.descriptor.html).toBe('<span class="tobeProvBadge">1 задача AS IS → 1 операция</span>');
  });

  it("n=2 → badgeFew («{n} задачи AS IS → 1 операция»), бейдж на primary (первый списка)", () => {
    const index = makeIndex();
    index.reverse.set("AsIs_3", [
      { toBeId: "Task_b", fate: "transformed_to", ruleId: "R01_move" },
      { toBeId: "Task_a", fate: "transformed_to", ruleId: "R02_merge" },
    ]);
    const { editorCanvas, editorOverlays, editorContainer } = setup({ index });
    click(editorContainer, { x: 450, y: 10 });
    expect(editorCanvas.addMarkerCalls).toEqual([["Task_b", "tobeProvLinked"], ["Task_a", "tobeProvLinked"]]);
    const badge = editorOverlays.addCalls[0];
    expect(badge.element).toBe("Task_b");
    expect(badge.descriptor.html).toBe('<span class="tobeProvBadge">2 задачи AS IS → 1 операция</span>');
  });

  it("клик в пустоту (промах по ghost): обратная подсветка и бейдж сняты", () => {
    const { editorCanvas, editorOverlays, editorContainer, ghostCanvas } = setup();
    click(editorContainer, { x: 450, y: 10 });
    editorCanvas.removeMarkerCalls.length = 0;
    ghostCanvas.removeMarkerCalls.length = 0;
    click(editorContainer, { x: 950, y: 900 });
    expect(editorCanvas.removeMarkerCalls).toEqual([["Task_b", "tobeProvLinked"]]);
    expect(ghostCanvas.removeMarkerCalls).toEqual([["AsIs_3", "tobeProvAncestor"]]);
    expect(editorOverlays.removeCalls.length).toBe(1);
    expect(editorOverlays.addCalls.length).toBe(1);
  });

  it("клик по shape TO BE (реплика diagram-js: .djs-element.djs-shape + data-element-id): обратный сценарий НЕ запускается", () => {
    const { editorCanvas, editorOverlays, editorContainer } = setup();
    const shape = document.createElement("g");
    shape.setAttribute("class", "djs-element djs-shape");
    shape.setAttribute("data-element-id", "Task_a");
    editorContainer.appendChild(shape);
    click(editorContainer, { x: 10, y: 10, target: shape });
    expect(editorCanvas.addMarkerCalls).toEqual([]);
    expect(editorOverlays.addCalls).toEqual([]);
  });

  // T10 fix round 2 (T12 e2e, R1): bpmn-js рендерит корневую группу процесса
  // как <g class="layer-root-1" data-element-id="Process_…"> — ПРЕДОК всех
  // фигур. Гард «клик по элементу» по любому data-element-id матчил её на
  // каждом «пустом» клике → обратная подсветка была недостижима. Клик по
  // пустоте ВНУТРИ root-группы обязан запускать hit-test.
  it("клик по пустоте внутри root-группы (layer-root-1 + data-element-id): hit-test ЗАПУСКАЕТСЯ", () => {
    const { editorCanvas, editorOverlays, editorContainer } = setup();
    const root = document.createElement("g");
    root.setAttribute("class", "layer-root-1");
    root.setAttribute("data-element-id", "Process_tobe_x");
    editorContainer.appendChild(root);
    click(editorContainer, { x: 450, y: 10, target: root });
    expect(editorCanvas.addMarkerCalls).toEqual([["Task_b", "tobeProvLinked"]]);
    expect(editorOverlays.addCalls.length).toBe(1);
  });

  it("drag (> 5px): обратный сценарий не запускается", () => {
    const { editorCanvas, editorOverlays, editorContainer } = setup();
    editorContainer.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 450, clientY: 10 }));
    editorContainer.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 480, clientY: 10 }));
    expect(editorCanvas.addMarkerCalls).toEqual([]);
    expect(editorOverlays.addCalls).toEqual([]);
  });

  it("новый selection после обратной подсветки: linked + бейдж сняты", () => {
    const { eventBus, editorCanvas, editorOverlays, editorContainer } = setup();
    click(editorContainer, { x: 450, y: 10 });
    editorCanvas.removeMarkerCalls.length = 0;
    eventBus.emit("selection.changed", { newSelection: [{ id: "Task_a" }] });
    expect(editorCanvas.removeMarkerCalls).toEqual([["Task_b", "tobeProvLinked"]]);
    expect(editorOverlays.removeCalls.length).toBe(1);
  });

  it("destroy после обратной подсветки: overlays.remove вызван, клик после destroy — no-op", () => {
    const { highlight, editorCanvas, editorOverlays, editorContainer, ghostCanvas } = setup();
    click(editorContainer, { x: 450, y: 10 });
    highlight.destroy();
    expect(editorOverlays.removeCalls.length).toBe(1);
    expect(ghostCanvas.removeMarkerCalls).toEqual([["AsIs_3", "tobeProvAncestor"]]);
    editorCanvas.addMarkerCalls.length = 0;
    editorOverlays.addCalls.length = 0;
    click(editorContainer, { x: 450, y: 10 });
    expect(editorCanvas.addMarkerCalls).toEqual([]);
    expect(editorOverlays.addCalls).toEqual([]);
  });
});

// T10-fix (review round 1, Critical): обратная подсветка стиралась собственным
// же кликом — diagram-js по клику в пустоту editor-canvas БЕЗУСЛОВНО фаерит
// selection.changed с пустым selection (InteractionEvents → element.click →
// SelectionBehavior → Selection.select(null)). Реплика реального pipeline на
// фейковом eventBus: pointerup(→reverse-hit) → click → selection.changed(null).
describe("T10-fix: обратная подсветка переживает click → select(null) диаграммы", () => {
  // Полный жест клика по точке: pointerdown + pointerup (reverse-hit) →
  // нативный click → пустой selection.changed от Selection.select(null).
  function clickWithDiagramPipeline(container, eventBus, { x, y, target = null } = {}) {
    const opts = { bubbles: true, clientX: x, clientY: y };
    container.dispatchEvent(new MouseEvent("pointerdown", opts));
    (target || container).dispatchEvent(new MouseEvent("pointerup", opts));
    (target || container).dispatchEvent(new MouseEvent("click", opts));
    eventBus.emit("selection.changed", { newSelection: [] });
  }

  it("pointerup(reverse-hit) → click → selection.changed(null): linked/ancestor/badge ВЫЖИВАЮТ", () => {
    const { eventBus, editorCanvas, editorOverlays, editorContainer, ghostCanvas } = setup();
    clickWithDiagramPipeline(editorContainer, eventBus, { x: 450, y: 10 });
    // Пустой флэт поглощён: ничего не снято.
    expect(editorCanvas.removeMarkerCalls).toEqual([]);
    expect(ghostCanvas.removeMarkerCalls).toEqual([]);
    expect(editorOverlays.removeCalls).toEqual([]);
    // И подсветка реально применена.
    expect(editorCanvas.addMarkerCalls).toEqual([["Task_b", "tobeProvLinked"]]);
    expect(ghostCanvas.addMarkerCalls).toEqual([["AsIs_3", "tobeProvAncestor"]]);
    expect(editorOverlays.addCalls.length).toBe(1);
  });

  it("честный сброс после: клик в пустоту БЕЗ ghost-hit + selection.changed(null) — всё снято", () => {
    const { eventBus, editorCanvas, editorOverlays, editorContainer, ghostCanvas } = setup();
    clickWithDiagramPipeline(editorContainer, eventBus, { x: 450, y: 10 });
    // Второй клик мимо любых ghost-rect: reverse-hit без попадания — НЕ вооружает подавление.
    clickWithDiagramPipeline(editorContainer, eventBus, { x: 950, y: 900 });
    expect(editorCanvas.removeMarkerCalls).toEqual([["Task_b", "tobeProvLinked"]]);
    expect(ghostCanvas.removeMarkerCalls).toEqual([["AsIs_3", "tobeProvAncestor"]]);
    expect(editorOverlays.removeCalls.length).toBe(1);
    expect(editorOverlays.addCalls.length).toBe(1);
  });

  it("два клика подряд по ghost: оба применяются и выживают, бейдж без дубля (add 2, remove 1)", () => {
    const { eventBus, editorCanvas, editorOverlays, editorContainer, ghostCanvas } = setup();
    clickWithDiagramPipeline(editorContainer, eventBus, { x: 450, y: 10 });
    editorCanvas.removeMarkerCalls.length = 0;
    clickWithDiagramPipeline(editorContainer, eventBus, { x: 410, y: 20 });
    expect(editorCanvas.removeMarkerCalls).toEqual([["Task_b", "tobeProvLinked"]]);
    expect(editorCanvas.addMarkerCalls.filter((c) => c[1] === "tobeProvLinked").length).toBe(2);
    // add=2: второй клик честно снял и переставил ancestor (залежек нет).
    expect(ghostCanvas.addMarkerCalls.filter((c) => c[1] === "tobeProvAncestor" && c[0] === "AsIs_3").length).toBe(2);
    expect(editorOverlays.addCalls.length).toBe(2);
    expect(editorOverlays.removeCalls.length).toBe(1);
  });

  it("клик по ghost → клик по TO BE-элементу: прямая T9 срабатывает, игнор НЕ залипает", () => {
    const { eventBus, editorCanvas, editorOverlays, editorContainer, ghostCanvas, ghostContainer } = setup();
    clickWithDiagramPipeline(editorContainer, eventBus, { x: 450, y: 10 });

    // Клик по shape TO BE (реплика diagram-js: .djs-element.djs-shape +
    // data-element-id): reverse пропущен, selection.changed НЕпустой —
    // прямая подсветка T9.
    const shape = document.createElement("g");
    shape.setAttribute("class", "djs-element djs-shape");
    shape.setAttribute("data-element-id", "Task_a");
    editorContainer.appendChild(shape);
    clickWithDiagramPipeline(editorContainer, eventBus, { x: 10, y: 10, target: shape });
    eventBus.emit("selection.changed", { newSelection: [{ id: "Task_a" }] });
    expect(editorCanvas.removeMarkerCalls).toEqual([["Task_b", "tobeProvLinked"]]);
    expect(editorOverlays.removeCalls.length).toBe(1);
    expect(ghostCanvas.addMarkerCalls).toEqual([
      ["AsIs_3", "tobeProvAncestor"],
      ["AsIs_1", "tobeProvAncestor"],
      ["AsIs_2", "tobeProvAncestor"],
    ]);
    // Прямая подсветка T9 применена: dim на ghost-контейнере.
    expect(ghostContainer.classList.contains("provenance-dim")).toBe(true);

    // Игнор не залип: следующий честный пустой selection всё снимает.
    eventBus.emit("selection.changed", { newSelection: [] });
    expect(ghostCanvas.removeMarkerCalls).toEqual([["AsIs_3", "tobeProvAncestor"], ["AsIs_1", "tobeProvAncestor"], ["AsIs_2", "tobeProvAncestor"]]);
    expect(ghostContainer.classList.contains("provenance-dim")).toBe(false);
  });
});
