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

test("flushSave uses xmlOverride as primary manual-save source when provided", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"stale_store\"/>",
    rev: 0,
    dirty: true,
    lastSavedRev: 0,
  });
  let runtimeGetXmlCalls = 0;
  const persisted = [];
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_manual_canonical_primary",
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 80 }),
      getXml: async () => {
        runtimeGetXmlCalls += 1;
        return { ok: true, xml: "<bpmn:definitions id=\"stale_runtime\"/>", token: 80 };
      },
    }),
    transformPersistedXml: (xmlText) => String(xmlText || "").replace("id=\"canonical\"", "id=\"canonical_final\""),
    persistence: {
      saveRaw: async (_sid, xml, rev) => {
        persisted.push({ xml: String(xml || ""), rev: Number(rev || 0) });
        return { ok: true, status: 200, storedRev: 2 };
      },
    },
  });

  const result = await coordinator.flushSave("publish_manual_save", {
    xmlOverride: "<bpmn:definitions id=\"canonical\"/>",
  });

  assert.equal(result.ok, true);
  assert.equal(runtimeGetXmlCalls, 0);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].xml, "<bpmn:definitions id=\"canonical_final\"/>");
  assert.equal(result.xml, "<bpmn:definitions id=\"canonical_final\"/>");
  assert.equal(store.getState().xml, "<bpmn:definitions id=\"canonical_final\"/>");
});

test("flushSave lifecycle override prevents fallback to stale runtime source", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"saved\"/>",
    rev: 2,
    dirty: true,
    lastSavedRev: 2,
  });
  let runtimeGetXmlCalls = 0;
  const persisted = [];
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_lifecycle_override",
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 81 }),
      getXml: async () => {
        runtimeGetXmlCalls += 1;
        return { ok: true, xml: "<bpmn:definitions id=\"stale_runtime\"/>", token: 81 };
      },
    }),
    persistence: {
      saveRaw: async (_sid, xml, rev, reason) => {
        persisted.push({ xml: String(xml || ""), rev: Number(rev || 0), reason: String(reason || "") });
        return { ok: true, status: 200, storedRev: 3 };
      },
    },
  });

  const result = await coordinator.flushSave("beforeunload", {
    xmlOverride: "<bpmn:definitions id=\"fresh_runtime_delta\"/>",
  });

  assert.equal(result.ok, true);
  assert.equal(runtimeGetXmlCalls, 0);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].reason, "beforeunload");
  assert.equal(persisted[0].xml, "<bpmn:definitions id=\"fresh_runtime_delta\"/>");
  assert.equal(result.xml, "<bpmn:definitions id=\"fresh_runtime_delta\"/>");
  assert.equal(store.getState().xml, "<bpmn:definitions id=\"fresh_runtime_delta\"/>");
});
