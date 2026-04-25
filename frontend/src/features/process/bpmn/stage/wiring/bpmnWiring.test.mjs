import assert from "node:assert/strict";
import test from "node:test";

import { createBpmnWiring } from "./bpmnWiring.js";

function ref(initial) {
  return { current: initial };
}

function createCtx() {
  const refs = {
    bpmnStoreRef: ref(null),
    bpmnStoreUnsubRef: ref(null),
    lastStoreEventRef: ref({}),
    bpmnPersistenceRef: ref(null),
    bpmnCoordinatorRef: ref(null),
    modelerRuntimeRef: ref(null),
    activeSessionRef: ref("sid_1"),
    suppressCommandStackRef: ref(0),
    ensureVisibleCycleRef: ref(0),
    modelerReadyRef: ref(false),
    runtimeTokenRef: ref(0),
    modelerRef: ref(null),
    draftRef: ref({}),
  };
  const values = {
    xml: "",
    xmlDraft: "",
    draft: {},
    sessionId: "sid_1",
    activeProjectId: "pid_1",
  };
  const state = {
    setXml: () => {},
    setXmlDraft: () => {},
    setXmlDirty: () => {},
  };
  const readOnly = {
    draftRef: refs.draftRef,
  };
  const api = {
    saveBpmnSnapshot: async () => ({ ok: true }),
    getLatestBpmnSnapshot: async () => ({ ok: false }),
    apiGetBpmnXml: async () => ({ ok: true, xml: "" }),
    apiPutBpmnXml: async () => ({ ok: true }),
  };
  const callbacks = {
    localKey: (sid) => `k:${String(sid || "")}`,
    isLocalSessionId: () => false,
    logBpmnTrace: () => {},
    bumpSaveCounter: () => 0,
    onCoordinatorTrace: () => {},
    shouldLogBpmnTrace: () => false,
    probeCanvas: () => {},
    emitDiagramMutation: () => {},
    trackRuntimeStatus: () => {},
    transformPersistedXml: (xml) => String(xml || ""),
    fnv1aHex: () => "hash",
  };
  return { refs, values, state, readOnly, api, callbacks };
}

test("ensureBpmnCoordinator binds runtime callbacks only once", () => {
  const ctx = createCtx();
  let createCoordinatorCalls = 0;
  let bindRuntimeCalls = 0;
  let createRuntimeCalls = 0;

  const coordinator = {
    bindRuntime(runtime) {
      bindRuntimeCalls += 1;
      this.runtime = runtime;
    },
  };
  const deps = {
    createBpmnStore: () => ({
      subscribe: () => () => {},
      getState: () => ({ xml: "" }),
    }),
    createBpmnPersistence: () => ({
      saveRaw: async () => ({ ok: true }),
      loadRaw: async () => ({ ok: true }),
      cacheRaw: () => ({ ok: true }),
    }),
    createBpmnCoordinator: () => {
      createCoordinatorCalls += 1;
      return coordinator;
    },
    createBpmnRuntime: () => {
      createRuntimeCalls += 1;
      return { id: `runtime_${createRuntimeCalls}` };
    },
    forceTaskResizeRulesModule: {},
    pmModdleDescriptor: {},
  };

  const wiring = createBpmnWiring(() => ctx, deps);
  const c1 = wiring.ensureBpmnCoordinator();
  const c2 = wiring.ensureBpmnCoordinator();
  assert.equal(c1, c2);
  assert.equal(createCoordinatorCalls, 1);

  const r1 = wiring.ensureModelerRuntime();
  const r2 = wiring.ensureModelerRuntime();
  assert.equal(r1, r2);
  assert.equal(createRuntimeCalls, 1);
  assert.equal(bindRuntimeCalls, 1);
  assert.equal(ctx.refs.modelerRuntimeRef.current, r1);
});

test("ensureBpmnCoordinator forwards xml transform hook into coordinator", () => {
  const ctx = createCtx();
  const calls = [];
  ctx.callbacks.transformPersistedXml = (xmlText, meta) => {
    calls.push({ xmlText: String(xmlText || ""), meta });
    return "<bpmn:definitions id=\"finalized\"/>";
  };
  let capturedOptions = null;
  const deps = {
    createBpmnStore: () => ({
      subscribe: () => () => {},
      getState: () => ({ xml: "" }),
    }),
    createBpmnPersistence: () => ({
      saveRaw: async () => ({ ok: true }),
      loadRaw: async () => ({ ok: true }),
      cacheRaw: () => ({ ok: true }),
    }),
    createBpmnCoordinator: (options) => {
      capturedOptions = options;
      return { bindRuntime() {} };
    },
  };

  const wiring = createBpmnWiring(() => ctx, deps);
  wiring.ensureBpmnCoordinator();

  const transformed = capturedOptions.transformPersistedXml("<bpmn:definitions id=\"raw\"/>", { reason: "autosave" });
  assert.equal(transformed, "<bpmn:definitions id=\"finalized\"/>");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].xmlText, "<bpmn:definitions id=\"raw\"/>");
  assert.equal(calls[0].meta.reason, "autosave");
});

test("ensureBpmnStore guards redundant setter fanout for identical snapshots", () => {
  const ctx = createCtx();
  const calls = [];
  ctx.state.setXml = (value) => calls.push(["xml", value]);
  ctx.state.setXmlDraft = (value) => calls.push(["draft", value]);
  ctx.state.setXmlDirty = (value) => calls.push(["dirty", value]);

  let subscriber = null;
  const deps = {
    createBpmnStore: () => ({
      subscribe(cb) {
        subscriber = cb;
        cb({
          xml: "",
          dirty: false,
          source: "stage_init",
          reason: "subscribe",
          rev: 0,
          hash: "hash0",
        });
        return () => {};
      },
      getState: () => ({ xml: "", dirty: false, rev: 0 }),
    }),
  };

  const wiring = createBpmnWiring(() => ctx, deps);
  wiring.ensureBpmnStore();
  calls.length = 0;

  subscriber({
    xml: "",
    dirty: false,
    source: "runtime_change",
    reason: "setXml",
    rev: 1,
    hash: "hash0",
  });
  assert.deepEqual(calls, []);

  subscriber({
    xml: "<xml />",
    dirty: true,
    source: "runtime_change",
    reason: "setXml",
    rev: 2,
    hash: "hash1",
  });
  assert.deepEqual(calls, [
    ["xml", "<xml />"],
    ["draft", "<xml />"],
    ["dirty", true],
  ]);

  calls.length = 0;
  subscriber({
    xml: "<xml />",
    dirty: true,
    source: "runtime_change",
    reason: "setXml",
    rev: 3,
    hash: "hash1",
  });
  assert.deepEqual(calls, []);

  subscriber({
    xml: "<xml />",
    dirty: false,
    source: "markSaved",
    reason: "markSaved",
    rev: 3,
    hash: "hash1",
  });
  assert.deepEqual(calls, [["dirty", false]]);
});

test("ensureBpmnPersistence forwards external diagram state version hooks", () => {
  const ctx = createCtx();
  const getBaseDiagramStateVersion = () => 7;
  const rememberDiagramStateVersion = () => 8;
  ctx.readOnly.getBaseDiagramStateVersion = getBaseDiagramStateVersion;
  ctx.readOnly.rememberDiagramStateVersion = rememberDiagramStateVersion;

  let capturedOptions = null;
  const deps = {
    createBpmnStore: () => ({
      subscribe: () => () => {},
      getState: () => ({ xml: "", dirty: false, rev: 0 }),
    }),
    createBpmnPersistence: (options) => {
      capturedOptions = options;
      return {
        saveRaw: async () => ({ ok: true }),
        loadRaw: async () => ({ ok: true }),
        cacheRaw: () => ({ ok: true }),
      };
    },
    createBpmnCoordinator: () => ({ bindRuntime() {} }),
  };

  const wiring = createBpmnWiring(() => ctx, deps);
  const persistence = wiring.ensureBpmnPersistence();
  assert.ok(persistence);
  assert.equal(typeof capturedOptions?.getBaseDiagramStateVersion, "function");
  assert.equal(typeof capturedOptions?.rememberDiagramStateVersion, "function");
  assert.equal(capturedOptions.getBaseDiagramStateVersion(), 7);
  assert.equal(capturedOptions.rememberDiagramStateVersion(9, { sessionId: "sid_1" }), 8);
});
