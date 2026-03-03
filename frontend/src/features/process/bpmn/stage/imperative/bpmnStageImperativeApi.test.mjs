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
