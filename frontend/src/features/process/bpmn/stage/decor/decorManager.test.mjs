import assert from "node:assert/strict";
import test from "node:test";

import {
  applyStepTimeDecor,
  applyPropertiesOverlayDecor,
  applyHappyFlowDecor,
  applyRobotMetaDecor,
  clearPropertiesOverlayDecor,
  clearHappyFlowDecor,
  clearRobotMetaDecor,
} from "./decorManager.js";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function asObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function toText(v) {
  return String(v || "").trim();
}

function createStyleMock() {
  const props = new Map();
  return {
    setProperty(name, value) {
      props.set(String(name || ""), String(value || ""));
    },
    removeProperty(name) {
      props.delete(String(name || ""));
    },
    has(name) {
      return props.has(String(name || ""));
    },
  };
}

function createGraphicsMock() {
  const attrs = new Map();
  return {
    style: createStyleMock(),
    setAttribute(name, value) {
      attrs.set(String(name || ""), String(value || ""));
    },
    removeAttribute(name) {
      attrs.delete(String(name || ""));
    },
    hasAttr(name) {
      return attrs.has(String(name || ""));
    },
  };
}

function createMarkerCanvasMock() {
  const active = new Set();
  const addCalls = [];
  const removeCalls = [];
  return {
    active,
    addCalls,
    removeCalls,
    zoom() {
      return 1;
    },
    addMarker(elementId, className) {
      const key = `${String(elementId || "")}|${String(className || "")}`;
      active.add(key);
      addCalls.push(key);
    },
    removeMarker(elementId, className) {
      const key = `${String(elementId || "")}|${String(className || "")}`;
      active.delete(key);
      removeCalls.push(key);
    },
  };
}

function createOverlayMock() {
  let seq = 0;
  const addCalls = [];
  const removeCalls = [];
  return {
    addCalls,
    removeCalls,
    add(elementId, typeOrPayload = {}, payloadMaybe = null) {
      seq += 1;
      const id = `ov_${seq}`;
      let overlayType = "";
      let payload = {};
      if (typeof typeOrPayload === "string") {
        overlayType = String(typeOrPayload || "");
        payload = asObject(payloadMaybe);
      } else {
        payload = asObject(typeOrPayload);
      }
      addCalls.push({ id, elementId: String(elementId || ""), payload, overlayType });
      return id;
    },
    remove(id) {
      removeCalls.push(String(id || ""));
    },
  };
}

function createRegistry(elements = []) {
  const byId = new Map();
  const graphicsById = new Map();
  const list = elements.map((el) => {
    const item = { ...el };
    byId.set(String(item.id || ""), item);
    graphicsById.set(String(item.id || ""), createGraphicsMock());
    return item;
  });
  return {
    get(id) {
      return byId.get(String(id || "")) || null;
    },
    filter(fn) {
      return list.filter((el) => fn(el));
    },
    getGraphics(id) {
      return graphicsById.get(String(id || "")) || null;
    },
  };
}

function createInstance(registry, canvas, overlays) {
  return {
    get(name) {
      if (name === "elementRegistry") return registry;
      if (name === "canvas") return canvas;
      if (name === "overlays") return overlays;
      return null;
    },
  };
}

function withDocumentStub(run) {
  const prevDocument = globalThis.document;
  const prevHTMLElement = globalThis.HTMLElement;
  class StubHTMLElement {
    constructor() {
      const styleMap = new Map();
      this.className = "";
      this.textContent = "";
      this.title = "";
      this.dataset = {};
      this.style = {
        setProperty(name, value) {
          styleMap.set(String(name || ""), String(value || ""));
        },
        getPropertyValue(name) {
          return styleMap.get(String(name || "")) || "";
        },
      };
      this.childNodes = [];
    }

    addEventListener() {
    }

    appendChild(child) {
      this.childNodes.push(child);
      return child;
    }

    contains(child) {
      return this === child || this.childNodes.includes(child);
    }
  }
  globalThis.HTMLElement = StubHTMLElement;
  globalThis.document = {
    createElement() {
      return new StubHTMLElement();
    },
  };
  try {
    run();
  } finally {
    globalThis.document = prevDocument;
    globalThis.HTMLElement = prevHTMLElement;
  }
}

function createPropertyOverlayCtx({
  preview,
  alwaysEnabled = false,
  alwaysPreviewByElementId = null,
  elements = null,
  zoom = 1,
} = {}) {
  const canvas = createMarkerCanvasMock();
  canvas.zoom = () => Number(zoom || 1);
  const overlays = createOverlayMock();
  const registry = createRegistry(
    Array.isArray(elements) && elements.length
      ? elements
      : [
          {
            id: "Task_1",
            type: "bpmn:Task",
            x: 100,
            y: 50,
            width: 140,
            height: 80,
            businessObject: { id: "Task_1", $type: "bpmn:Task" },
          },
        ],
  );
  const inst = createInstance(registry, canvas, overlays);
  const refs = {
    propertiesOverlayStateRef: { current: { viewer: {}, editor: {} } },
  };
  const readOnly = {
    selectedPropertiesOverlayPreviewRef: { current: preview || null },
    propertiesOverlayAlwaysEnabledRef: { current: !!alwaysEnabled },
    propertiesOverlayAlwaysPreviewByElementIdRef: { current: alwaysPreviewByElementId || null },
  };
  return {
    canvas,
    overlays,
    refs,
    ctx: {
      inst,
      kind: "viewer",
      refs,
      readOnly,
      getters: {
        findShapeByNodeId: (r, id) => r.get(id),
        findShapeForHint: (r, hint) => r.get(hint?.nodeId),
        isConnectionElement: (el) => Array.isArray(el?.waypoints),
      },
      utils: {
        asArray,
        asObject,
        toText,
      },
    },
  };
}

function createStepTimeDecorCtx({
  elements = null,
  nodes = null,
  zoom = 1,
  stepTimeUnit = "min",
} = {}) {
  const canvas = createMarkerCanvasMock();
  canvas.zoom = () => Number(zoom || 1);
  const overlays = createOverlayMock();
  const registry = createRegistry(
    Array.isArray(elements) && elements.length
      ? elements
      : [
          {
            id: "Task_1",
            type: "bpmn:Task",
            x: 100,
            y: 50,
            width: 140,
            height: 80,
            businessObject: { id: "Task_1", $type: "bpmn:Task" },
          },
        ],
  );
  const inst = createInstance(registry, canvas, overlays);
  const refs = {
    stepTimeOverlayStateRef: { current: { viewer: [], editor: [] } },
    stepTimeDecorSignatureRef: { current: { viewer: "", editor: "" } },
  };
  const readOnly = {
    draftRef: {
      current: {
        nodes: Array.isArray(nodes) && nodes.length
          ? nodes
          : [{ id: "Task_1", stepTimeMin: 5 }],
      },
    },
    stepTimeUnitRef: { current: stepTimeUnit },
  };
  return {
    overlays,
    refs,
    ctx: {
      inst,
      kind: "viewer",
      refs,
      readOnly,
      getters: {
        findShapeByNodeId: (r, id) => r.get(id),
        findShapeForHint: (r, hint) => r.get(hint?.nodeId),
      },
      callbacks: {
        setSelectedDecor: () => {},
        emitElementSelection: () => {},
      },
      utils: {
        asArray,
        asObject,
        toText,
        normalizeStepTimeUnit: (value) => (toText(value).toLowerCase() === "sec" ? "sec" : "min"),
        readStepTimeMinutes: (node) => {
          const minutes = Number(node?.stepTimeMin);
          return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
        },
        readStepTimeSeconds: (node) => {
          const seconds = Number(node?.stepTimeSec);
          return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
        },
      },
    },
  };
}

test("properties overlay decor respects visibility flag and hidden preview", () => {
  const { overlays, refs, ctx } = createPropertyOverlayCtx({
    preview: {
      elementId: "Task_1",
      enabled: false,
      items: [{ label: "Емкость", value: "Лоток 150x55" }],
    },
  });
  withDocumentStub(() => {
    applyPropertiesOverlayDecor(ctx);
    assert.equal(overlays.addCalls.length, 0);
    assert.deepEqual(refs.propertiesOverlayStateRef.current.viewer, {});
  });
});

test("properties overlay decor updates immediately when preview content changes", () => {
  const fixture = createPropertyOverlayCtx({
    preview: {
      elementId: "Task_1",
      enabled: true,
      hiddenCount: 0,
      items: [{ label: "Емкость", value: "Лоток 150x55" }],
    },
  });
  withDocumentStub(() => {
    applyPropertiesOverlayDecor(fixture.ctx);
    assert.equal(fixture.overlays.addCalls.length, 1);
    assert.equal(Object.keys(fixture.refs.propertiesOverlayStateRef.current.viewer).length, 1);

    fixture.ctx.readOnly.selectedPropertiesOverlayPreviewRef.current = {
      elementId: "Task_1",
      enabled: true,
      hiddenCount: 1,
      items: [
        { label: "Емкость", value: "Гастроемкость" },
        { label: "Оборудование", value: "Весы" },
      ],
    };
    applyPropertiesOverlayDecor(fixture.ctx);
    assert.equal(fixture.overlays.addCalls.length, 1);
    assert.equal(fixture.overlays.removeCalls.length, 0);
    assert.equal(Object.keys(fixture.refs.propertiesOverlayStateRef.current.viewer).length, 1);

    clearPropertiesOverlayDecor(fixture.ctx);
    assert.equal(Object.keys(fixture.refs.propertiesOverlayStateRef.current.viewer).length, 0);
  });
});

test("properties overlay decor coexists with notes/time/robot overlay positions", () => {
  const fixture = createPropertyOverlayCtx({
    preview: {
      elementId: "Task_1",
      enabled: true,
      hiddenCount: 0,
      items: [{ label: "Емкость", value: "Лоток 150x55" }],
    },
  });
  withDocumentStub(() => {
    applyPropertiesOverlayDecor(fixture.ctx);
    const addCall = fixture.overlays.addCalls[0];
    assert.equal(addCall.elementId, "Task_1");
    assert.equal(addCall.payload.position.top, -14);
    assert.equal(addCall.payload.position.left, 70);
    assert.equal(addCall.payload.scale, false);
    assert.equal(addCall.overlayType, "fpc-properties");
  });
});

test("properties overlay decor binds to preview element id and renders rows for non-empty values", () => {
  const fixture = createPropertyOverlayCtx({
    preview: {
      elementId: "Task_1",
      enabled: true,
      hiddenCount: 1,
      items: [
        { label: "Ингредиент", value: "Креветки" },
        { label: "equipment", value: "Весы" },
      ],
    },
  });
  withDocumentStub(() => {
    applyPropertiesOverlayDecor(fixture.ctx);
    assert.equal(fixture.overlays.addCalls.length, 1);
    const addCall = fixture.overlays.addCalls[0];
    assert.equal(addCall.elementId, "Task_1");
    const container = addCall.payload.html;
    assert.equal(container?.dataset?.nodeId, "Task_1");
    assert.equal(Array.isArray(container?.childNodes), true);
    assert.equal(container.childNodes.length, 1);
    const table = container.childNodes[0];
    assert.equal(Array.isArray(table?.childNodes), true);
    // 2 visible property rows + 1 summary row (+hiddenCount)
    assert.equal(table.childNodes.length, 3);
    const firstRow = table.childNodes[0];
    assert.ok(String(firstRow.style.getPropertyValue("--fpc-property-accent") || "").length > 0);
    assert.ok(String(firstRow.style.getPropertyValue("--fpc-property-bg") || "").length > 0);
  });
});

test("properties overlay decor uses connection geometry and reacts to zoom changes", () => {
  const fixture = createPropertyOverlayCtx({
    preview: {
      elementId: "Flow_1",
      enabled: true,
      hiddenCount: 0,
      items: [{ label: "temperature", value: "65" }],
    },
    elements: [
      {
        id: "Flow_1",
        type: "bpmn:SequenceFlow",
        x: 100,
        y: 180,
        width: 320,
        height: 24,
        waypoints: [
          { x: 100, y: 190 },
          { x: 260, y: 190 },
          { x: 420, y: 190 },
        ],
        businessObject: { id: "Flow_1", $type: "bpmn:SequenceFlow" },
      },
    ],
    zoom: 1,
  });
  withDocumentStub(() => {
    applyPropertiesOverlayDecor(fixture.ctx);
    assert.equal(fixture.overlays.addCalls.length, 1);
    const firstCall = fixture.overlays.addCalls[0];
    assert.equal(firstCall.elementId, "Flow_1");
    assert.equal(firstCall.payload.position.left, 160);
    assert.equal(firstCall.payload.position.top, -10);
    const firstWidth = Number.parseInt(String(firstCall.payload.html.style.width || "0"), 10);
    assert.ok(firstWidth >= 52 && firstWidth <= 116);

    fixture.canvas.zoom = () => 0.35;
    applyPropertiesOverlayDecor(fixture.ctx);
    assert.equal(fixture.overlays.addCalls.length, 2);
    assert.equal(fixture.overlays.removeCalls.length, 1);
    const secondCall = fixture.overlays.addCalls[1];
    const secondWidth = Number.parseInt(String(secondCall.payload.html.style.width || "0"), 10);
    assert.ok(secondWidth <= firstWidth);
  });
});

test("step time decor clamps badge readability on zoom-out without changing anchor geometry", () => {
  const fixture = createStepTimeDecorCtx({
    zoom: 0.35,
    nodes: [{ id: "Task_1", stepTimeMin: 3 }],
  });
  withDocumentStub(() => {
    applyStepTimeDecor(fixture.ctx);
    assert.equal(fixture.overlays.addCalls.length, 1);
    const addCall = fixture.overlays.addCalls[0];
    assert.equal(addCall.elementId, "Task_1");
    assert.equal(addCall.payload.position.left, 138);
    assert.equal(addCall.payload.position.top, 81);
    assert.deepEqual(addCall.payload.scale, { min: 0.8 });
    assert.equal(addCall.payload.html.className, "fpcNodeBadge fpcNodeBadge--time");
    assert.equal(addCall.payload.html.textContent, "3 мин");
  });
});

test("same property key keeps deterministic shared color across task and sequence overlays", () => {
  const fixture = createPropertyOverlayCtx({
    preview: null,
    alwaysEnabled: true,
    alwaysPreviewByElementId: {
      Task_1: {
        elementId: "Task_1",
        enabled: true,
        hiddenCount: 0,
        items: [{ key: "temperature", label: "temperature", value: "65" }],
      },
      Flow_1: {
        elementId: "Flow_1",
        enabled: true,
        hiddenCount: 0,
        items: [{ key: "temperature", label: "temperature", value: "65" }],
      },
    },
    elements: [
      {
        id: "Task_1",
        type: "bpmn:Task",
        x: 100,
        y: 50,
        width: 160,
        height: 80,
        businessObject: { id: "Task_1", $type: "bpmn:Task" },
      },
      {
        id: "Flow_1",
        type: "bpmn:SequenceFlow",
        x: 100,
        y: 180,
        width: 320,
        height: 24,
        waypoints: [
          { x: 100, y: 190 },
          { x: 260, y: 190 },
          { x: 420, y: 190 },
        ],
        businessObject: { id: "Flow_1", $type: "bpmn:SequenceFlow" },
      },
    ],
  });
  withDocumentStub(() => {
    applyPropertiesOverlayDecor(fixture.ctx);
    assert.equal(fixture.overlays.addCalls.length, 2);
    const [firstCall, secondCall] = fixture.overlays.addCalls;
    const firstRow = firstCall.payload.html.childNodes[0].childNodes[0];
    const secondRow = secondCall.payload.html.childNodes[0].childNodes[0];
    const firstAccent = firstRow.style.getPropertyValue("--fpc-property-accent");
    const secondAccent = secondRow.style.getPropertyValue("--fpc-property-accent");
    assert.equal(firstAccent, secondAccent);
    assert.equal(String(firstRow.className).includes("fpcPropertyRow--linked"), true);
    assert.equal(String(secondRow.className).includes("fpcPropertyRow--linked"), true);
  });
});

test("properties overlay decor renders all element overlays when always mode is enabled", () => {
  const fixture = createPropertyOverlayCtx({
    preview: null,
    alwaysEnabled: true,
    alwaysPreviewByElementId: {
      Task_1: {
        elementId: "Task_1",
        enabled: true,
        hiddenCount: 0,
        items: [{ label: "container", value: "Лоток 150x55" }],
      },
      Task_2: {
        elementId: "Task_2",
        enabled: true,
        hiddenCount: 1,
        items: [
          { label: "equipment", value: "Весы" },
          { label: "value", value: "1" },
        ],
      },
    },
    elements: [
      {
        id: "Task_1",
        type: "bpmn:Task",
        x: 100,
        y: 50,
        width: 140,
        height: 80,
        businessObject: { id: "Task_1", $type: "bpmn:Task" },
      },
      {
        id: "Task_2",
        type: "bpmn:Task",
        x: 280,
        y: 50,
        width: 160,
        height: 80,
        businessObject: { id: "Task_2", $type: "bpmn:Task" },
      },
    ],
  });
  withDocumentStub(() => {
    applyPropertiesOverlayDecor(fixture.ctx);
    assert.equal(fixture.overlays.addCalls.length, 2);
    assert.equal(Object.keys(fixture.refs.propertiesOverlayStateRef.current.viewer).length, 2);
    const addedIds = fixture.overlays.addCalls.map((call) => call.elementId).sort();
    assert.deepEqual(addedIds, ["Task_1", "Task_2"]);
    fixture.overlays.addCalls.forEach((call) => {
      assert.equal(call.overlayType, "fpc-properties");
    });
  });
});

test("happy flow decor apply/clear is idempotent for state refs", () => {
  const canvas = createMarkerCanvasMock();
  const overlays = createOverlayMock();
  const registry = createRegistry([
    {
      id: "Flow_1",
      type: "bpmn:SequenceFlow",
      waypoints: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      businessObject: { id: "Flow_1", $type: "bpmn:SequenceFlow" },
    },
    {
      id: "Task_1",
      type: "bpmn:Task",
      x: 100,
      y: 50,
      width: 140,
      height: 80,
      businessObject: { id: "Task_1", $type: "bpmn:Task" },
    },
  ]);
  const inst = createInstance(registry, canvas, overlays);
  const refs = {
    happyFlowMarkerStateRef: { current: { viewer: [], editor: [] } },
    happyFlowStyledStateRef: { current: { viewer: [], editor: [] } },
  };
  const ctx = {
    inst,
    kind: "viewer",
    refs,
    getters: {
      getFlowTierMetaMap: () => ({ Flow_1: { tier: "P0" } }),
      getNodePathMetaMap: () => ({ Task_1: { paths: ["P0", "P1"], sequence_key: "seq_primary" } }),
      isConnectionElement: (el) => Array.isArray(el?.waypoints),
      isShapeElement: (el) => !!el && !Array.isArray(el?.waypoints),
      isSelectableElement: () => true,
    },
    utils: { asArray, asObject, toText },
  };

  applyHappyFlowDecor(ctx);
  const firstMarkers = refs.happyFlowMarkerStateRef.current.viewer.length;
  const firstStyled = refs.happyFlowStyledStateRef.current.viewer.length;
  assert.equal(firstMarkers, 4);
  assert.equal(firstStyled, 2);

  applyHappyFlowDecor(ctx);
  assert.equal(refs.happyFlowMarkerStateRef.current.viewer.length, firstMarkers);
  assert.equal(refs.happyFlowStyledStateRef.current.viewer.length, firstStyled);

  clearHappyFlowDecor(ctx);
  assert.deepEqual(refs.happyFlowMarkerStateRef.current.viewer, []);
  assert.deepEqual(refs.happyFlowStyledStateRef.current.viewer, []);
  clearHappyFlowDecor(ctx);
  assert.deepEqual(refs.happyFlowMarkerStateRef.current.viewer, []);
  assert.deepEqual(refs.happyFlowStyledStateRef.current.viewer, []);
});

test("robot meta decor apply/clear is idempotent and does not duplicate overlays", () => {
  const canvas = createMarkerCanvasMock();
  const overlays = createOverlayMock();
  const registry = createRegistry([
    {
      id: "Task_1",
      type: "bpmn:Task",
      x: 100,
      y: 50,
      width: 140,
      height: 80,
      businessObject: { id: "Task_1", $type: "bpmn:Task" },
    },
  ]);
  const inst = createInstance(registry, canvas, overlays);
  const refs = {
    robotMetaDecorStateRef: { current: { viewer: {}, editor: {} } },
  };
  const readOnly = {
    robotMetaOverlayEnabledRef: { current: true },
    robotMetaOverlayFiltersRef: { current: { ready: true, incomplete: true } },
    robotMetaStatusByElementIdRef: { current: {} },
  };
  const ctx = {
    inst,
    kind: "viewer",
    refs,
    readOnly,
    getters: {
      getRobotMetaMap: () => ({
        Task_1: {
          exec: { mode: "machine", executor: "node_red", action_key: "robot.mix" },
          qc: { critical: false },
        },
      }),
      findShapeByNodeId: (r, id) => r.get(id),
      findShapeForHint: (r, hint) => r.get(hint?.nodeId),
    },
    utils: {
      asObject,
      toText,
      getRobotMetaStatus: (meta) => {
        const mode = toText(meta?.exec?.mode).toLowerCase();
        if (mode === "human") return "none";
        const action = toText(meta?.exec?.action_key);
        const executor = toText(meta?.exec?.executor);
        return action && executor ? "ready" : "incomplete";
      },
      robotMetaMissingFields: (meta) => {
        const missing = [];
        if (!toText(meta?.exec?.action_key)) missing.push("action_key");
        if (!toText(meta?.exec?.executor)) missing.push("executor");
        return missing;
      },
    },
  };

  withDocumentStub(() => {
    applyRobotMetaDecor(ctx);
    assert.equal(overlays.addCalls.length, 1);
    assert.equal(Object.keys(refs.robotMetaDecorStateRef.current.viewer).length, 1);

    applyRobotMetaDecor(ctx);
    assert.equal(overlays.addCalls.length, 1);
    assert.equal(overlays.removeCalls.length, 0);
    assert.equal(Object.keys(refs.robotMetaDecorStateRef.current.viewer).length, 1);

    clearRobotMetaDecor(ctx);
    assert.equal(Object.keys(refs.robotMetaDecorStateRef.current.viewer).length, 0);
    assert.equal(overlays.removeCalls.length, 1);

    clearRobotMetaDecor(ctx);
    assert.equal(Object.keys(refs.robotMetaDecorStateRef.current.viewer).length, 0);
    assert.equal(overlays.removeCalls.length, 1);
  });
});
