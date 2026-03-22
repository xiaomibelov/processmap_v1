import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore from "../store/createBpmnStore.js";
import createLocalMutationStaging from "./createLocalMutationStaging.js";

test("stageRuntimeChange preserves current staging behavior and requests autosave", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  const cacheCalls = [];
  const emitted = [];
  const autosaveReasons = [];
  let onRuntimeChangeCalls = 0;
  const getXmlCalls = [];

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
  });

  const result = await staging.stageRuntimeChange({ type: "commandStack.changed", command: "shape.move" });

  assert.equal(result.ok, true);
  assert.equal(result.sessionId, "sid_local_mutation_staging");
  assert.equal(result.source, "runtime_change");
  assert.equal(result.xml, "<bpmn:definitions id=\"new\"/>");
  assert.equal(result.xmlAuthority, "staged_local_runtime_snapshot");
  assert.equal(result.xmlExportMode, "runtime_unformatted");
  assert.equal(result.rev, 6);
  assert.equal(result.dirty, true);
  assert.equal(result.autosaveRequested, true);
  assert.equal(onRuntimeChangeCalls, 1);
  assert.deepEqual(getXmlCalls, [{ format: false }]);
  assert.deepEqual(autosaveReasons, ["autosave"]);
  assert.equal(store.getState().xml, "<bpmn:definitions id=\"new\"/>");
  assert.equal(store.getState().rev, 6);
  assert.equal(store.getState().dirty, true);
  assert.deepEqual(cacheCalls, [
    {
      sid: "sid_local_mutation_staging",
      xml: "<bpmn:definitions id=\"new\"/>",
      rev: 6,
      reason: "runtime_change",
    },
  ]);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].event, "REV_BUMP");
  assert.equal(emitted[0].payload.sid, "sid_local_mutation_staging");
  assert.equal(emitted[0].payload.rev, 6);
  assert.equal(emitted[0].payload.reason, "runtime_change");
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
