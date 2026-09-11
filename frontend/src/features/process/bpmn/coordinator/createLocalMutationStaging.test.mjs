import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore from "../store/createBpmnStore.js";
import createLocalMutationStaging from "./createLocalMutationStaging.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeStaging(store, overrides = {}) {
  const cacheCalls = [];
  const emitted = [];
  const autosaveReasons = [];
  let onRuntimeChangeCalls = 0;
  const getXmlCalls = [];
  const getOnRuntimeChangeCalls = () => onRuntimeChangeCalls;
  const staging = createLocalMutationStaging({
    getStore: () => store,
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 9 }),
      getXml: async (options = {}) => {
        getXmlCalls.push(options);
        return { ok: true, xml: "<bpmn:definitions id=\"new\"/>", token: 9 };
      },
    }),
    getSessionId: () => "sid_local_mutation_staging",
    onRuntimeChange: () => {
      onRuntimeChangeCalls += 1;
    },
    cacheRaw: (sid, xml, rev, reason) => {
      cacheCalls.push({ sid, xml, rev, reason });
    },
    emit: (event, payload) => {
      emitted.push({ event, payload });
    },
    requestAutosave: (reason) => {
      autosaveReasons.push(reason);
    },
    ...overrides,
  });
  return {
    staging,
    cacheCalls,
    emitted,
    autosaveReasons,
    onRuntimeChangeCalls,
    getXmlCalls,
    getOnRuntimeChangeCalls,
  };
}

test("stageRuntimeChange skips autosave for positional shape.move", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  const { staging, autosaveReasons, emitted } = makeStaging(store);

  const result = await staging.stageRuntimeChange({ type: "commandStack.changed", command: "shape.move" });

  assert.equal(result.ok, true);
  assert.equal(result.positional, true);
  assert.equal(result.autosaveRequested, false);
  assert.equal(result.dirty, true);
  assert.equal(store.getState().rev, 6);
  assert.deepEqual(autosaveReasons, []);
  assert.ok(emitted.some((e) => e.event === "STAGE_POSITIONAL_CHANGE"));
});

test("stageRuntimeChange requests autosave for structural commands", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  const { staging, autosaveReasons } = makeStaging(store);

  const result = await staging.stageRuntimeChange({ type: "commandStack.changed", command: "shape.create" });

  assert.equal(result.ok, true);
  assert.equal(result.positional, false);
  assert.equal(result.autosaveRequested, true);
  assert.deepEqual(autosaveReasons, ["autosave"]);
});

test("stageRuntimeChange coalesces structural command serialization into the throttled snapshot", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  const {
    staging,
    cacheCalls,
    emitted,
    autosaveReasons,
    getOnRuntimeChangeCalls,
    getXmlCalls,
  } = makeStaging(store);

  const result = await staging.stageRuntimeChange({ type: "commandStack.changed", command: "connection.create" });

  // In-frame: синхронный dirty-mark без полной сериализации (контур
  // fix/canvas-250-editing-performance — полный saveXML на каждую команду
  // был O(n) на схемах 250+ элементов).
  assert.equal(result.ok, true);
  assert.equal(result.sessionId, "sid_local_mutation_staging");
  assert.equal(result.source, "runtime_change");
  assert.equal(result.xml, "<bpmn:definitions id=\"old\"/>");
  assert.equal(result.xmlAuthority, "staged_local_store_fallback");
  assert.equal(result.xmlExportMode, "store_fallback");
  assert.equal(result.rev, 6);
  assert.equal(result.dirty, true);
  assert.equal(result.autosaveRequested, true);
  assert.equal(getOnRuntimeChangeCalls(), 1);
  assert.deepEqual(getXmlCalls, [], "structural command must not serialize in-frame");
  assert.deepEqual(autosaveReasons, ["autosave"]);
  assert.equal(store.getState().xml, "<bpmn:definitions id=\"old\"/>");
  assert.equal(store.getState().rev, 6);
  assert.equal(store.getState().dirty, true);
  assert.deepEqual(cacheCalls, [], "recovery cache is fed by the throttled snapshot");
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].event, "REV_BUMP");
  assert.equal(emitted[0].payload.sid, "sid_local_mutation_staging");
  assert.equal(emitted[0].payload.rev, 6);
  assert.equal(emitted[0].payload.reason, "runtime_change");

  // Trailing edge окна 300 мс: ровно одна сериализация + cacheRaw.
  await sleep(360);
  assert.deepEqual(getXmlCalls, [{ format: false }]);
  assert.equal(store.getState().xml, "<bpmn:definitions id=\"new\"/>");
  assert.equal(store.getState().rev, 7);
  assert.deepEqual(cacheCalls, [
    {
      sid: "sid_local_mutation_staging",
      xml: "<bpmn:definitions id=\"new\"/>",
      rev: 7,
      reason: "runtime_change_throttled",
    },
  ]);
  assert.equal(emitted.length, 2);
  assert.equal(emitted[1].event, "REV_BUMP");
  assert.equal(emitted[1].payload.reason, "runtime_change_throttled");
});

test("stageRuntimeChange is a no-op without store or session", async () => {
  const stagingNoStore = createLocalMutationStaging({
    getSessionId: () => "sid_local_mutation_staging",
  });
  const stagingNoSession = createLocalMutationStaging({
    getStore: () => createBpmnStore({ xml: "<bpmn:definitions id=\"old\"/>" }),
    getSessionId: () => "",
  });

  assert.deepEqual(await stagingNoStore.stageRuntimeChange({}), { ok: false, reason: "missing_store" });
  assert.deepEqual(await stagingNoSession.stageRuntimeChange({}), { ok: false, reason: "missing_session" });
});

test("stageRuntimeChange falls back to existing store xml when runtime xml is unavailable", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"existing\"/>",
    rev: 2,
    dirty: false,
  });
  const staging = createLocalMutationStaging({
    getStore: () => store,
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 10 }),
      getXml: async () => ({ ok: false, reason: "save_failed" }),
    }),
    getSessionId: () => "sid_local_mutation_fallback",
    requestAutosave: () => {},
  });

  const result = await staging.stageRuntimeChange({ type: "commandStack.changed" });

  assert.equal(result.ok, true);
  assert.equal(result.xml, "<bpmn:definitions id=\"existing\"/>");
  assert.equal(result.xmlAuthority, "staged_local_store_fallback");
  assert.equal(result.xmlExportMode, "store_fallback");
  assert.equal(store.getState().xml, "<bpmn:definitions id=\"existing\"/>");
  assert.equal(store.getState().rev, 3);
  assert.equal(store.getState().dirty, true);
});


test("stageRuntimeChange skips autosave for lane.updateRefs", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  const { staging, autosaveReasons, emitted } = makeStaging(store);

  const result = await staging.stageRuntimeChange({ type: "commandStack.changed", command: "lane.updateRefs" });

  assert.equal(result.ok, true);
  assert.equal(result.positional, true);
  assert.equal(result.autosaveRequested, false);
  assert.deepEqual(autosaveReasons, []);
  assert.ok(emitted.some((e) => e.event === "STAGE_POSITIONAL_CHANGE" && e.payload.command === "lane.updateRefs"));
});

test("stageRuntimeChange suppresses autosave while dragging", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  const { staging, autosaveReasons, emitted } = makeStaging(store, { getIsDragging: () => true });

  const result = await staging.stageRuntimeChange({ type: "commandStack.changed", command: "shape.create" });

  assert.equal(result.ok, true);
  assert.equal(result.positional, true);
  assert.equal(result.autosaveRequested, false);
  assert.equal(result.skipReason, "drag_in_progress");
  assert.deepEqual(autosaveReasons, []);
  assert.ok(emitted.some((e) => e.event === "STAGE_POSITIONAL_CHANGE" && e.payload.reason === "drag_in_progress"));
});

test("stageRuntimeCommand infers command from commandStack top when event command is missing", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  const getRuntime = () => ({
    getStatus: () => ({ ready: true, defs: true, token: 9 }),
    getXml: async () => ({ ok: true, xml: "<bpmn:definitions id=\"new\"/>", token: 9 }),
    getInstance: () => ({
      get: (name) => {
        if (name === "commandStack") {
          return { _stack: [{ command: "lane.updateRefs" }] };
        }
        return null;
      },
    }),
  });
  const { staging, autosaveReasons } = makeStaging(store, { getRuntime });

  const result = await staging.stageRuntimeChange({ type: "commandStack.changed" });

  assert.equal(result.ok, true);
  assert.equal(result.positional, true);
  assert.equal(result.autosaveRequested, false);
  assert.deepEqual(autosaveReasons, []);
});
