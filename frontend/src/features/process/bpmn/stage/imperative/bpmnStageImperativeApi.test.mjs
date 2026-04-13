import assert from "node:assert/strict";
import test from "node:test";

import { createBpmnStageImperativeApi } from "./bpmnStageImperativeApi.js";

function createCtx(overrides = {}) {
  const refs = {
    modelerRef: { current: { id: "modeler" } },
    viewerRef: { current: { id: "viewer" } },
    modelerRuntimeRef: { current: { zoomIn: () => false, zoomOut: () => false, fit: () => false, focus: () => false } },
    modelerReadyRef: { current: true },
    viewerReadyRef: { current: true },
    userViewportTouchedRef: { current: false },
    runtimeTokenRef: { current: 1 },
    activeSessionRef: { current: "sid_1" },
    loadTokenRef: { current: 0 },
    bpmnCoordinatorRef: { current: { isFlushing: () => false } },
    bottlenecksRef: { current: [] },
  };

  const values = {
    view: "viewer",
    sessionId: "sid_1",
    xmlDirty: false,
    xmlDraft: "<xml/>",
  };

  const state = {
    setErr: () => {},
  };

  const callbacks = {
    asArray: (x) => (Array.isArray(x) ? x : []),
    ensureModeler: async () => refs.modelerRef.current,
    ensureViewer: async () => refs.viewerRef.current,
    hasDefinitionsLoaded: () => true,
    safeFit: async () => ({ ok: true }),
    suppressViewboxEvents: () => {},
    ensureVisibleOnInstance: async () => ({ ok: true }),
    shouldLogBpmnTrace: () => false,
    loadFromBackend: () => {},
    isLocalSessionId: () => false,
    clearLocalOnly: () => {},
    apiDeleteBpmnXml: async () => ({ ok: true }),
    applyBottleneckDecor: () => {},
    clearBottleneckDecor: () => {},
    focusNodeOnInstance: () => false,
    preparePlaybackCache: () => {},
    buildExecutionGraphFromInstance: () => ({ ok: true, graph: {} }),
    applyPlaybackFrameOnInstance: () => false,
    clearPlaybackDecor: () => {},
    flashNode: () => {},
    flashBadge: () => {},
    captureTemplatePackOnModeler: async () => ({ ok: true }),
    insertTemplatePackOnModeler: async () => ({ ok: true }),
    applyCommandOpsOnModeler: async () => ({ ok: true, applied: 0, failed: 0, changedIds: [], results: [] }),
    validateBpmnXmlText: () => "",
    logBpmnTrace: () => {},
    persistXmlSnapshot: async () => ({ ok: true }),
    renderModeler: async () => {},
    renderViewer: async () => {},
    saveLocalFromModeler: async () => ({ ok: true }),
    saveXmlDraftText: async () => ({ ok: true }),
    seedNew: () => {},
  };

  const base = { refs, values, state, callbacks };
  return {
    ...base,
    ...overrides,
    refs: { ...refs, ...(overrides.refs || {}) },
    values: { ...values, ...(overrides.values || {}) },
    state: { ...state, ...(overrides.state || {}) },
    callbacks: { ...callbacks, ...(overrides.callbacks || {}) },
  };
}

test("createBpmnStageImperativeApi exposes expected public methods", () => {
  const api = createBpmnStageImperativeApi(createCtx());
  const methods = [
    "ensureVisible",
    "saveLocal",
    "saveXmlDraft",
    "resetBackend",
    "focusNode",
    "setCanvasViewboxX",
    "getSelectedElementIds",
    "selectElements",
    "setPlaybackFrame",
    "insertTemplatePack",
    "applyCommandOps",
    "runDiagramContextAction",
  ];
  methods.forEach((name) => {
    assert.equal(typeof api[name], "function", `${name} should be a function`);
  });
  assert.equal("executeDiagramContextAction" in api, false);
});

test("focusNode proxies to focusNodeOnInstance with same args", () => {
  const focusCalls = [];
  const ctx = createCtx({
    values: {
      view: "viewer",
    },
    callbacks: {
      focusNodeOnInstance: (inst, kind, nodeId, options) => {
        focusCalls.push({ inst, kind, nodeId, options });
        return kind === "viewer";
      },
    },
  });
  const api = createBpmnStageImperativeApi(ctx);
  const options = { markerClass: "fpcMark", source: "test" };
  const ok = api.focusNode("Task_1", options);
  assert.equal(ok, true);
  assert.deepEqual(focusCalls, [
    { inst: ctx.refs.viewerRef.current, kind: "viewer", nodeId: "Task_1", options },
    { inst: ctx.refs.modelerRef.current, kind: "editor", nodeId: "Task_1", options },
  ]);
});

test("selectElements uses selection service and returns selected ids", () => {
  const selected = [];
  const selectionService = {
    current: [],
    get() {
      return this.current;
    },
    select(items) {
      this.current = Array.isArray(items) ? items : [];
      selected.push(this.current.map((item) => item.id));
    },
  };
  const registry = {
    get(id) {
      return id === "Task_1" || id === "Task_2" ? { id } : null;
    },
  };
  const viewer = {
    id: "viewer",
    get(service) {
      if (service === "selection") return selectionService;
      if (service === "elementRegistry") return registry;
      return null;
    },
  };
  const focusCalls = [];
  const ctx = createCtx({
    refs: {
      viewerRef: { current: viewer },
    },
    callbacks: {
      focusNodeOnInstance: (inst, kind, nodeId, options) => {
        focusCalls.push({ inst, kind, nodeId, options });
        return true;
      },
    },
  });
  const api = createBpmnStageImperativeApi(ctx);
  const result = api.selectElements(["Task_1", "Task_2", "Missing"], { markerClass: "fpcMark" });
  assert.deepEqual(result, {
    ok: true,
    count: 2,
    ids: ["Task_1", "Task_2"],
    missingIds: ["Missing"],
  });
  assert.deepEqual(selected, [["Task_1", "Task_2"]]);
  assert.deepEqual(api.getSelectedElementIds(), ["Task_1", "Task_2"]);
  assert.deepEqual(focusCalls, [
    {
      inst: viewer,
      kind: "viewer",
      nodeId: "Task_1",
      options: {
        markerClass: "fpcMark",
        source: "template_apply",
      },
    },
  ]);
});

test("importXmlText persists backend snapshot with explicit import_bpmn intent", async () => {
  const persistCalls = [];
  const renderCalls = [];
  const ctx = createCtx({
    values: { view: "viewer" },
    callbacks: {
      persistXmlSnapshot: async (xml, hint) => {
        persistCalls.push({ xml, hint });
        return { ok: true };
      },
      renderViewer: async (xml) => {
        renderCalls.push(xml);
      },
    },
  });
  const api = createBpmnStageImperativeApi(ctx);

  const ok = await api.importXmlText("<bpmn:definitions/>");
  assert.equal(ok, true);
  assert.deepEqual(persistCalls, [{ xml: "<bpmn:definitions/>", hint: "import_bpmn" }]);
  assert.deepEqual(renderCalls, ["<bpmn:definitions/>"]);
});

test("runDiagramContextAction remains the only public context-action entry and proxies executor results", async () => {
  const calls = [];
  const ctx = createCtx({
    callbacks: {
      executeDiagramContextAction: async (payload) => {
        calls.push(payload);
        return { ok: true, changedIds: ["Task_1"] };
      },
    },
  });
  const api = createBpmnStageImperativeApi(ctx);

  const result = await api.runDiagramContextAction({
    actionId: "open_properties",
    target: { id: "Task_1", kind: "element" },
  });

  assert.deepEqual(calls, [{
    actionId: "open_properties",
    target: { id: "Task_1", kind: "element" },
  }]);
  assert.deepEqual(result, { ok: true, changedIds: ["Task_1"] });
  assert.equal("executeDiagramContextAction" in api, false);
});

test("runDiagramContextAction returns explicit unavailable result without private executor", async () => {
  const api = createBpmnStageImperativeApi(createCtx());
  const result = await api.runDiagramContextAction({ actionId: "open_properties" });
  assert.deepEqual(result, {
    ok: false,
    error: "context_action_unavailable",
  });
});

test("runDiagramContextAction no longer accepts legacy private callback alias", async () => {
  const legacyCalls = [];
  const api = createBpmnStageImperativeApi(createCtx({
    callbacks: {
      runDiagramContextAction: async (payload) => {
        legacyCalls.push(payload);
        return { ok: true, changedIds: ["Task_1"] };
      },
    },
  }));

  const result = await api.runDiagramContextAction({ actionId: "open_properties" });

  assert.deepEqual(legacyCalls, []);
  assert.deepEqual(result, {
    ok: false,
    error: "context_action_unavailable",
  });
});

test("getUndoRedoState reads availability from commandStack without runtime error", () => {
  const commandStack = {
    canUndo: () => true,
    canRedo: () => false,
  };
  const viewer = {
    id: "viewer",
    get(service) {
      if (service === "commandStack") return commandStack;
      return null;
    },
  };
  const api = createBpmnStageImperativeApi(createCtx({
    refs: {
      viewerRef: { current: viewer },
    },
    values: {
      view: "viewer",
    },
  }));

  const state = api.getUndoRedoState({ mode: "viewer" });

  assert.deepEqual(state, {
    canUndo: true,
    canRedo: false,
    ready: true,
  });
});

test("getUndoRedoState returns bounded false state when commandStack is unavailable", () => {
  const viewer = {
    id: "viewer",
    get() {
      return null;
    },
  };
  const api = createBpmnStageImperativeApi(createCtx({
    refs: {
      viewerRef: { current: viewer },
    },
    values: {
      view: "viewer",
    },
  }));

  const state = api.getUndoRedoState({ mode: "viewer" });

  assert.deepEqual(state, {
    canUndo: false,
    canRedo: false,
    ready: true,
  });
});

test("undo and redo route through the same private context-action executor boundary", async () => {
  const calls = [];
  const ctx = createCtx({
    callbacks: {
      executeDiagramContextAction: async (payload) => {
        calls.push(payload);
        return { ok: true, changedIds: [] };
      },
    },
  });
  const api = createBpmnStageImperativeApi(ctx);

  const undoResult = await api.undo();
  const redoResult = await api.redo();

  assert.deepEqual(calls, [
    { actionId: "undo" },
    { actionId: "redo" },
  ]);
  assert.deepEqual(undoResult, { ok: true, changedIds: [] });
  assert.deepEqual(redoResult, { ok: true, changedIds: [] });
});

test("setCanvasViewboxX clamps target x into canvas inner range", () => {
  const viewboxCalls = [];
  const canvas = {
    viewbox(next) {
      if (next && typeof next === "object") {
        viewboxCalls.push(next);
        return next;
      }
      return {
        x: 120,
        y: 40,
        width: 300,
        height: 200,
        inner: {
          x: 0,
          width: 1000,
        },
      };
    },
  };
  const viewer = {
    id: "viewer",
    get(service) {
      if (service === "canvas") return canvas;
      return null;
    },
  };
  const userViewportTouchedRef = { current: false };
  const api = createBpmnStageImperativeApi(createCtx({
    refs: {
      viewerRef: { current: viewer },
      userViewportTouchedRef,
    },
    values: {
      view: "viewer",
    },
  }));

  const ok = api.setCanvasViewboxX(9999, { mode: "viewer" });

  assert.equal(ok, true);
  assert.deepEqual(viewboxCalls, [{
    x: 700,
    y: 40,
    width: 300,
    height: 200,
  }]);
  assert.equal(userViewportTouchedRef.current, true);
});
