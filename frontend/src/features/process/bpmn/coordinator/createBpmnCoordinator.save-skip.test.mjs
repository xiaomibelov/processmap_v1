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

test("flushSave persists transformed xml in a single write", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 8,
    dirty: true,
    lastSavedRev: 0,
  });
  const persisted = [];
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_transform_once",
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 79 }),
      getXml: async () => ({ ok: true, xml: "<bpmn:definitions id=\"raw\"/>", token: 79 }),
    }),
    transformPersistedXml: (xmlText) => String(xmlText || "").replace("id=\"raw\"", "id=\"finalized\""),
    persistence: {
      saveRaw: async (_sid, xml, rev) => {
        persisted.push({ xml: String(xml || ""), rev: Number(rev || 0) });
        return { ok: true, status: 200, storedRev: 9 };
      },
    },
  });

  const result = await coordinator.flushSave("manual_save");

  assert.equal(result.ok, true);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].xml, "<bpmn:definitions id=\"finalized\"/>");
  assert.equal(result.xml, "<bpmn:definitions id=\"finalized\"/>");
  assert.equal(result.xmlAlreadyTransformed, true);
  assert.equal(store.getState().xml, "<bpmn:definitions id=\"finalized\"/>");
});
