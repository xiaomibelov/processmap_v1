import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHappyFlowDecor,
  applyRobotMetaDecor,
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
    add(elementId, payload = {}) {
      seq += 1;
      const id = `ov_${seq}`;
      addCalls.push({ id, elementId: String(elementId || ""), payload });
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
  globalThis.document = {
    createElement() {
      return {
        className: "",
        textContent: "",
        title: "",
        dataset: {},
        style: {},
      };
    },
  };
  try {
    run();
  } finally {
    globalThis.document = prevDocument;
  }
}

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
