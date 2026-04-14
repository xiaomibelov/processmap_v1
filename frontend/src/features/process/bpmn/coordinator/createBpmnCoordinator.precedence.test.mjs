import test from "node:test";
import assert from "node:assert/strict";

import createBpmnCoordinator from "./createBpmnCoordinator.js";

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createStore(initialState = {}) {
  let state = {
    xml: String(initialState.xml || ""),
    rev: Number(initialState.rev || 0),
    dirty: initialState.dirty === true,
    lastHash: fnv1aHex(String(initialState.xml || "")),
  };
  return {
    getState() {
      return state;
    },
    setXml(xml, _source, options = {}) {
      const loadedRev = Number(options?.loadedRev || 0);
      state = {
        ...state,
        xml: String(xml || ""),
        rev: loadedRev > 0 ? loadedRev : state.rev,
        dirty: options?.dirty === true,
        lastHash: fnv1aHex(String(xml || "")),
      };
      return state;
    },
    markLoaded(rev, hash) {
      state = {
        ...state,
        rev: Number(rev || state.rev),
        dirty: false,
        lastHash: String(hash || state.lastHash || ""),
      };
    },
  };
}

test("reload is remote-first by default and does not silently skip on existing store xml", async () => {
  const store = createStore({ xml: "<bpmn:old/>", rev: 3, dirty: false });
  let loadCalls = 0;
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_remote_first",
    persistence: {
      loadRaw: async () => {
        loadCalls += 1;
        return {
          ok: true,
          status: 200,
          source: "backend",
          sourceReason: "remote_authoritative_after_remote_read",
          xml: "<bpmn:new/>",
          rev: 4,
          hash: fnv1aHex("<bpmn:new/>"),
        };
      },
    },
  });

  const loaded = await coordinator.reload({ reason: "session_reload" });

  assert.equal(loadCalls, 1);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.applied, true);
  assert.equal(loaded.source, "backend");
  assert.equal(loaded.sourceReason, "remote_authoritative_after_remote_read");
  assert.equal(store.getState().xml, "<bpmn:new/>");
  assert.equal(store.getState().rev, 4);
});

test("preferStore remains an explicit opt-in path", async () => {
  const store = createStore({ xml: "<bpmn:store/>", rev: 11, dirty: false });
  let loadCalls = 0;
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_store_first",
    persistence: {
      loadRaw: async () => {
        loadCalls += 1;
        return {
          ok: true,
          status: 200,
          source: "backend",
          xml: "<bpmn:new/>",
          rev: 12,
          hash: fnv1aHex("<bpmn:new/>"),
        };
      },
    },
  });

  const loaded = await coordinator.reload({ preferStore: true, reason: "explicit_store_priority" });

  assert.equal(loadCalls, 0);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.applied, false);
  assert.equal(loaded.reason, "store_priority");
  assert.equal(loaded.source, "store");
  assert.equal(loaded.xml, "<bpmn:store/>");
});

test("flushSave propagates conflict status for tab-switch diagnostics classification", async () => {
  const store = createStore({ xml: "<bpmn:new/>", rev: 9, dirty: true });
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_conflict",
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 4 }),
      getXml: async () => ({ ok: true, xml: "<bpmn:new/>", token: 4 }),
    }),
    persistence: {
      saveRaw: async () => ({
        ok: false,
        status: 409,
        error: "revision conflict",
        errorDetails: {
          code: "DIAGRAM_STATE_CONFLICT",
          session_id: "sid_conflict",
          client_base_version: 9,
          server_current_version: 10,
        },
      }),
    },
  });

  const saved = await coordinator.flushSave("tab_switch");
  assert.equal(saved.ok, false);
  assert.equal(saved.status, 409);
  assert.equal(saved.errorCode, "http_409");
  assert.match(String(saved.error || ""), /conflict/i);
  assert.equal(saved.errorDetails?.code, "DIAGRAM_STATE_CONFLICT");
  assert.equal(saved.errorDetails?.server_current_version, 10);
});
