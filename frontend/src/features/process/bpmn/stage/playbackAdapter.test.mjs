import assert from "node:assert/strict";
import test from "node:test";

import { createPlaybackOverlayAdapter } from "./playbackAdapter.js";

function ref(initial) {
  return { current: initial };
}

function createFlashRuntimeState() {
  return {
    node: {},
    badge: {},
    pill: {},
  };
}

function createPlaybackDecorRuntimeState() {
  return {
    nodeId: "",
    prevNodeId: "",
    flowId: "",
    subprocessId: "",
    frameKey: "",
    stepOverlayId: null,
    branchOverlayId: null,
    subprocessOverlayId: null,
    exitOverlayId: null,
    exitTimer: 0,
    markerNodeIds: [],
    markerFlowIds: [],
    markerSubprocessIds: [],
    overlayIds: [],
    gatewayOverlayId: null,
    cameraRaf: 0,
  };
}

function createCanvasMock() {
  const addMarkerCalls = [];
  const removeMarkerCalls = [];
  const styleProps = new Map();
  return {
    addMarkerCalls,
    removeMarkerCalls,
    _container: {
      style: {
        setProperty(name, value) {
          styleProps.set(String(name || ""), String(value || ""));
        },
      },
    },
    addMarker(elementId, className) {
      addMarkerCalls.push({ elementId: String(elementId || ""), className: String(className || "") });
    },
    removeMarker(elementId, className) {
      removeMarkerCalls.push({ elementId: String(elementId || ""), className: String(className || "") });
    },
    viewbox(next) {
      if (next) return next;
      return { x: 0, y: 0, width: 1200, height: 700 };
    },
    zoom() {
      return 1;
    },
  };
}

function createOverlaysMock() {
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

function createRegistryMock() {
  return {
    get(idRaw) {
      const id = String(idRaw || "");
      if (!id) return null;
      if (id.startsWith("Flow_")) {
        return {
          id,
          type: "bpmn:SequenceFlow",
          waypoints: [{ x: 10, y: 20 }, { x: 110, y: 80 }],
          businessObject: { id, $type: "bpmn:SequenceFlow" },
        };
      }
      return {
        id,
        type: "bpmn:Task",
        x: 100,
        y: 60,
        width: 120,
        height: 80,
        businessObject: { id, $type: "bpmn:Task" },
      };
    },
  };
}

function createInstance(canvas, overlays, registry) {
  return {
    get(name) {
      if (name === "canvas") return canvas;
      if (name === "overlays") return overlays;
      if (name === "elementRegistry") return registry;
      return null;
    },
  };
}

function withDomStubs(run) {
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const cancelCalls = [];
  const clearCalls = [];
  const rafCalls = [];

  globalThis.window = {
    cancelAnimationFrame(id) {
      cancelCalls.push(Number(id || 0));
    },
    clearTimeout(id) {
      clearCalls.push(Number(id || 0));
    },
    requestAnimationFrame(cb) {
      rafCalls.push(cb);
      return rafCalls.length;
    },
    setTimeout() {
      return 1;
    },
  };

  globalThis.document = {
    createElement(tag) {
      const el = {
        tagName: String(tag || "").toUpperCase(),
        className: "",
        textContent: "",
        title: "",
        dataset: {},
        style: {},
        children: [],
        appendChild(child) {
          this.children.push(child);
        },
        addEventListener() {
        },
      };
      return el;
    },
  };

  try {
    run({ cancelCalls, clearCalls });
  } finally {
    globalThis.window = prevWindow;
    globalThis.document = prevDocument;
  }
}

function createAdapterWithRefs(refs) {
  return createPlaybackOverlayAdapter(() => ({
    refs,
    getters: {
      findShapeByNodeId: (registry, nodeId) => registry.get(nodeId),
      findShapeForHint: (registry, hint) => registry.get(hint?.nodeId),
      isShapeElement: (el) => !!el && !Array.isArray(el?.waypoints),
    },
    callbacks: {
      clearSelectedDecor: () => {},
    },
    readOnly: {
      prefersReducedMotionRef: ref(false),
    },
    utils: {
      asArray: (x) => (Array.isArray(x) ? x : []),
      asObject: (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {}),
      toText: (v) => String(v || "").trim(),
      createFlashRuntimeState,
      createPlaybackDecorRuntimeState,
    },
  }));
}

test("clearPlaybackDecor clears timers, overlays and markers, then resets runtime state", () => {
  withDomStubs(({ cancelCalls, clearCalls }) => {
    const canvas = createCanvasMock();
    const overlays = createOverlaysMock();
    const registry = createRegistryMock();
    const inst = createInstance(canvas, overlays, registry);
    const refs = {
      playbackDecorStateRef: ref({
        viewer: {
          cameraRaf: 11,
          exitTimer: 22,
          markerNodeIds: ["Task_1"],
          markerFlowIds: ["Flow_1"],
          markerSubprocessIds: ["Sub_1"],
          stepOverlayId: "ov_step",
          overlayIds: ["ov_1", "ov_2"],
          gatewayOverlayId: "ov_gate",
        },
        editor: createPlaybackDecorRuntimeState(),
      }),
      playbackBboxCacheRef: ref({ viewer: {}, editor: {} }),
      flashStateRef: ref({ viewer: createFlashRuntimeState(), editor: createFlashRuntimeState() }),
      focusStateRef: ref({
        viewer: { elementId: "", timer: 0, markerClass: "fpcNodeFocus" },
        editor: { elementId: "", timer: 0, markerClass: "fpcNodeFocus" },
      }),
    };
    const adapter = createAdapterWithRefs(refs);

    adapter.clearPlaybackDecor(inst, "viewer");

    assert.deepEqual(cancelCalls, [11]);
    assert.deepEqual(clearCalls, [22]);
    assert.deepEqual(canvas.removeMarkerCalls, [
      { elementId: "Task_1", className: "fpcPlaybackNodeActive" },
      { elementId: "Task_1", className: "fpcPlaybackNodePrev" },
      { elementId: "Flow_1", className: "fpcPlaybackFlowActive" },
      { elementId: "Sub_1", className: "fpcPlaybackSubprocessActive" },
    ]);
    assert.deepEqual(overlays.removeCalls, ["ov_step", "ov_gate", "ov_1", "ov_2"]);
    assert.deepEqual(refs.playbackDecorStateRef.current.viewer, createPlaybackDecorRuntimeState());
  });
});

test("applyPlaybackFrameOnInstance applies flow/node markers and overlay for frame payload", () => {
  withDomStubs(() => {
    const canvas = createCanvasMock();
    const overlays = createOverlaysMock();
    const registry = createRegistryMock();
    const inst = createInstance(canvas, overlays, registry);
    const refs = {
      playbackDecorStateRef: ref({
        viewer: createPlaybackDecorRuntimeState(),
        editor: createPlaybackDecorRuntimeState(),
      }),
      playbackBboxCacheRef: ref({ viewer: {}, editor: {} }),
      flashStateRef: ref({ viewer: createFlashRuntimeState(), editor: createFlashRuntimeState() }),
      focusStateRef: ref({
        viewer: { elementId: "", timer: 0, markerClass: "fpcNodeFocus" },
        editor: { elementId: "", timer: 0, markerClass: "fpcNodeFocus" },
      }),
    };
    const adapter = createAdapterWithRefs(refs);
    const payload = {
      event: {
        id: "e1",
        type: "take_flow",
        flowId: "Flow_1",
        fromId: "Task_A",
        toId: "Task_B",
      },
      index: 0,
      total: 2,
      speed: 1,
      autoCamera: false,
    };

    const ok = adapter.applyPlaybackFrameOnInstance(inst, "viewer", payload);
    assert.equal(ok, true);
    assert.deepEqual(canvas.addMarkerCalls, [
      { elementId: "Flow_1", className: "fpcPlaybackFlowActive" },
      { elementId: "Task_A", className: "fpcPlaybackNodePrev" },
    ]);
    assert.equal(overlays.addCalls.length, 1);
    assert.equal(overlays.addCalls[0].elementId, "Task_B");
    assert.equal(refs.playbackDecorStateRef.current.viewer.flowId, "Flow_1");
    assert.equal(refs.playbackDecorStateRef.current.viewer.nodeId, "Task_B");
  });
});
