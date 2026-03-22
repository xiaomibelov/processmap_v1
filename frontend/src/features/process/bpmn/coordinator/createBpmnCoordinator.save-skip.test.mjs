import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore from "../store/createBpmnStore.js";
import createBpmnCoordinator from "./createBpmnCoordinator.js";

test("flushSave skips backend persist when xml is unchanged and store is clean", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"same\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  let saveCalls = 0;
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_skip_same_payload",
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 77 }),
      getXml: async () => ({ ok: true, xml: "<bpmn:definitions id=\"same\"/>", token: 77 }),
    }),
    persistence: {
      saveRaw: async () => {
        saveCalls += 1;
        return { ok: true, status: 200, storedRev: 6 };
      },
    },
  });

  const result = await coordinator.flushSave("manual_save");

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.unchanged, true);
  assert.equal(saveCalls, 0);
});

test("flushSave keeps backend persist when xml changed", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  let saveCalls = 0;
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_save_changed",
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 78 }),
      getXml: async () => ({ ok: true, xml: "<bpmn:definitions id=\"new\"/>", token: 78 }),
    }),
    persistence: {
      saveRaw: async () => {
        saveCalls += 1;
        return { ok: true, status: 200, storedRev: 6 };
      },
    },
  });

  const result = await coordinator.flushSave("manual_save");

  assert.equal(result.ok, true);
  assert.equal(result.skipped, undefined);
  assert.equal(saveCalls, 1);
});

test("flushSave forwards sync tokens from persistence save result", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 10,
    dirty: false,
    lastSavedRev: 10,
  });
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_save_sync_tokens",
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 79 }),
      getXml: async () => ({ ok: true, xml: "<bpmn:definitions id=\"newer\"/>", token: 79 }),
    }),
    persistence: {
      saveRaw: async () => ({
        ok: true,
        status: 200,
        storedRev: 11,
        syncVersionToken: "sync.11.200.zzzz9999",
        syncBpmnVersionToken: "bpmn.11",
        syncCollabVersionToken: "collab.200",
      }),
    },
  });

  const result = await coordinator.flushSave("manual_save");

  assert.equal(result.ok, true);
  assert.equal(result.storedRev, 11);
  assert.equal(result.syncVersionToken, "sync.11.200.zzzz9999");
  assert.equal(result.syncBpmnVersionToken, "bpmn.11");
  assert.equal(result.syncCollabVersionToken, "collab.200");
});

test("flushSave acknowledges local target revision when backend storedRev lags", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 4,
    dirty: true,
    lastSavedRev: 2,
  });
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_save_lagging_stored_rev",
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 80 }),
      getXml: async () => ({ ok: true, xml: "<bpmn:definitions id=\"new\"/>", token: 80 }),
    }),
    persistence: {
      saveRaw: async () => ({
        ok: true,
        status: 200,
        storedRev: 2,
      }),
    },
  });

  const result = await coordinator.flushSave("autosave");

  assert.equal(result.ok, true);
  assert.equal(result.storedRev, 2);
  assert.equal(result.rev, 4);
  assert.equal(store.getState().dirty, false);
  assert.equal(store.getState().lastSavedRev, 4);
});
