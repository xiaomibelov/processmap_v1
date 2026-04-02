import test from "node:test";
import assert from "node:assert/strict";

import createBpmnPersistence from "./createBpmnPersistence.js";

function createLocalStorageMock() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(String(key)) ? String(store.get(String(key))) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
  };
}

if (typeof globalThis.window === "undefined") {
  globalThis.window = { localStorage: createLocalStorageMock() };
} else if (!globalThis.window.localStorage) {
  globalThis.window.localStorage = createLocalStorageMock();
}

test("after remote save/read, stale runtime cache does not win over backend durable source", async () => {
  window.localStorage.clear();
  const traces = [];
  const getCalls = [];
  const persistence = createBpmnPersistence({
    getSessionDraft: () => ({ bpmn_xml: "", bpmn_xml_version: 2, version: 2 }),
    apiGetBpmnXml: async (sid, options) => {
      getCalls.push({ sid, options });
      return { ok: true, status: 200, xml: "<bpmn:new/>" };
    },
    onTrace: (event, payload) => traces.push({ event, payload }),
  });

  persistence.cacheRaw("sid_cache", "<bpmn:old/>", 2, "runtime_change");
  const loaded = await persistence.loadRaw("sid_cache");

  assert.equal(loaded.ok, true);
  assert.equal(loaded.source, "backend");
  assert.equal(loaded.xml, "<bpmn:new/>");
  assert.equal(loaded.sourceReason, "remote_authoritative_after_remote_read");
  assert.equal(getCalls.length, 1);
  assert.deepEqual(getCalls[0]?.options, {
    raw: true,
    includeOverlay: false,
    cacheBust: true,
  });
  assert.equal(
    traces.some((entry) => entry.event === "PERSISTENCE_LOAD_LOCAL_REJECTED_REMOTE_AUTHORITATIVE"),
    true,
  );
});

test("explicit local override remains possible and is tagged with a reason", async () => {
  window.localStorage.clear();
  const persistence = createBpmnPersistence({
    getSessionDraft: () => ({ bpmn_xml: "<bpmn:draft_local/>", bpmn_xml_version: 3, version: 3 }),
    apiGetBpmnXml: async () => ({ ok: true, status: 200, xml: "<bpmn:remote/>" }),
  });

  const loaded = await persistence.loadRaw("sid_draft", { preferLocalCandidate: true });

  assert.equal(loaded.ok, true);
  assert.equal(loaded.source, "draft");
  assert.equal(loaded.xml, "<bpmn:draft_local/>");
  assert.equal(loaded.sourceReason, "explicit_local_override");
});

test("forceRemote disables local winners and keeps backend as authoritative source", async () => {
  window.localStorage.clear();
  const persistence = createBpmnPersistence({
    getSessionDraft: () => ({ bpmn_xml: "<bpmn:draft_local/>", bpmn_xml_version: 7, version: 7 }),
    apiGetBpmnXml: async () => ({ ok: true, status: 200, xml: "<bpmn:remote/>" }),
  });

  const loaded = await persistence.loadRaw("sid_force", {
    forceRemote: true,
    preferLocalCandidate: true,
  });

  assert.equal(loaded.ok, true);
  assert.equal(loaded.source, "backend");
  assert.equal(loaded.xml, "<bpmn:remote/>");
  assert.equal(loaded.sourceReason, "remote_authoritative_after_remote_read");
});

test("save then reread resolves to remote durable truth even if stale local cache appears later", async () => {
  window.localStorage.clear();
  let remoteXml = "<bpmn:baseline/>";
  const persistence = createBpmnPersistence({
    getSessionDraft: () => ({ bpmn_xml: "<bpmn:stale_draft/>", bpmn_xml_version: 4, version: 4 }),
    apiPutBpmnXml: async (_sid, xml) => {
      remoteXml = String(xml || "");
      return { ok: true, status: 200, storedRev: 5 };
    },
    apiGetBpmnXml: async () => ({ ok: true, status: 200, xml: remoteXml }),
  });

  const saved = await persistence.saveRaw("sid_save_then_read", "<bpmn:durable_saved/>", 5, "manual_save");
  assert.equal(saved.ok, true);
  assert.equal(saved.source, "backend");

  persistence.cacheRaw("sid_save_then_read", "<bpmn:stale_cache_after_save/>", 5, "runtime_change");

  const loaded = await persistence.loadRaw("sid_save_then_read");
  assert.equal(loaded.ok, true);
  assert.equal(loaded.source, "backend");
  assert.equal(loaded.xml, "<bpmn:durable_saved/>");
  assert.equal(loaded.sourceReason, "remote_authoritative_after_remote_read");
});

test("when remote API is unavailable, local winner stays bounded fallback with explicit tag", async () => {
  window.localStorage.clear();
  const persistence = createBpmnPersistence({
    getSessionDraft: () => ({ bpmn_xml: "<bpmn:local_only/>", bpmn_xml_version: 1, version: 1 }),
  });

  const loaded = await persistence.loadRaw("sid_no_api");

  assert.equal(loaded.ok, true);
  assert.equal(loaded.source, "draft");
  assert.equal(loaded.xml, "<bpmn:local_only/>");
  assert.equal(loaded.sourceReason, "local_no_remote_api");
});
