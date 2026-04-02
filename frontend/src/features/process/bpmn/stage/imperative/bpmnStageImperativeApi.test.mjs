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
    "getSelectedElementIds",
    "selectElements",
    "setPlaybackFrame",
    "insertTemplatePack",
    "applyCommandOps",
  ];
  methods.forEach((name) => {
    assert.equal(typeof api[name], "function", `${name} should be a function`);
  });
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
