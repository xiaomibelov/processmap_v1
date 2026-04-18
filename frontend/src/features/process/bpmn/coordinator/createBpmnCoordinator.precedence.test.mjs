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
    lastSavedRev: Number(initialState.lastSavedRev || 0),
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
    markSaved(rev, hash) {
      const targetRev = Number(rev || state.rev || 0);
      state = {
        ...state,
        dirty: false,
        lastSavedRev: Math.max(Number(state.lastSavedRev || 0), targetRev),
        lastHash: String(hash || state.lastHash || ""),
      };
    },
  };
}

async function withWindowTimers(run) {
  const prevWindow = globalThis.window;
  globalThis.window = {
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
  };
  try {
    return await run();
  } finally {
    if (prevWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = prevWindow;
    }
  }
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

test("stale conflict from other-user path stops save cycle without hidden queued retry", async () => {
  await withWindowTimers(async () => {
    const store = createStore({ xml: "<bpmn:new/>", rev: 9, dirty: true, lastSavedRev: 8 });
    const saveCalls = [];
    const coordinator = createBpmnCoordinator({
      debounceMs: 10_000,
      store,
      getSessionId: () => "sid_conflict_other_user",
      getRuntime: () => ({
        getStatus: () => ({ ready: true, defs: true, token: 5 }),
        getXml: async () => ({ ok: true, xml: "<bpmn:new/>", token: 5 }),
      }),
      persistence: {
        saveRaw: async () => {
          saveCalls.push("saveRaw");
          if (saveCalls.length === 1) {
            return {
              ok: false,
              status: 409,
              error: "revision conflict",
              errorDetails: {
                code: "DIAGRAM_STATE_CONFLICT",
                session_id: "sid_conflict_other_user",
                client_base_version: 9,
                server_current_version: 10,
                server_last_write: { actor_user_id: "user_b" },
              },
            };
          }
          return { ok: true, status: 200, storedRev: 10 };
        },
      },
    });

    coordinator.scheduleSave("autosave");
    const saved = await coordinator.flushSave("manual_save");
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(saved.ok, false);
    assert.equal(saved.status, 409);
    assert.equal(saved.errorDetails?.code, "DIAGRAM_STATE_CONFLICT");
    assert.equal(saveCalls.length, 1);
  });
});

test("stale conflict from same-user multi-tab path also stops hidden retry in same cycle", async () => {
  await withWindowTimers(async () => {
    const store = createStore({ xml: "<bpmn:new/>", rev: 9, dirty: true, lastSavedRev: 8 });
    const saveCalls = [];
    const coordinator = createBpmnCoordinator({
      debounceMs: 10_000,
      store,
      getSessionId: () => "sid_conflict_same_user",
      getRuntime: () => ({
        getStatus: () => ({ ready: true, defs: true, token: 6 }),
        getXml: async () => ({ ok: true, xml: "<bpmn:new/>", token: 6 }),
      }),
      persistence: {
        saveRaw: async () => {
          saveCalls.push("saveRaw");
          if (saveCalls.length === 1) {
            return {
              ok: false,
              status: 409,
              error: "revision conflict",
              errorDetails: {
                code: "DIAGRAM_STATE_CONFLICT",
                session_id: "sid_conflict_same_user",
                client_base_version: 9,
                server_current_version: 10,
                server_last_write: { actor_user_id: "user_a" },
              },
            };
          }
          return { ok: true, status: 200, storedRev: 10 };
        },
      },
    });

    coordinator.scheduleSave("autosave");
    const saved = await coordinator.flushSave("manual_save");
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(saved.ok, false);
    assert.equal(saved.status, 409);
    assert.equal(saved.errorDetails?.code, "DIAGRAM_STATE_CONFLICT");
    assert.equal(saveCalls.length, 1);
  });
});

test("new explicit save action after stale conflict still persists normally", async () => {
  await withWindowTimers(async () => {
    const store = createStore({ xml: "<bpmn:new/>", rev: 9, dirty: true, lastSavedRev: 8 });
    const saveCalls = [];
    const coordinator = createBpmnCoordinator({
      debounceMs: 10_000,
      store,
      getSessionId: () => "sid_conflict_followup",
      getRuntime: () => ({
        getStatus: () => ({ ready: true, defs: true, token: 7 }),
        getXml: async () => ({ ok: true, xml: "<bpmn:after_conflict/>", token: 7 }),
      }),
      persistence: {
        saveRaw: async () => {
          saveCalls.push("saveRaw");
          if (saveCalls.length === 1) {
            return {
              ok: false,
              status: 409,
              error: "revision conflict",
              errorDetails: {
                code: "DIAGRAM_STATE_CONFLICT",
                session_id: "sid_conflict_followup",
                client_base_version: 9,
                server_current_version: 10,
              },
            };
          }
          return { ok: true, status: 200, storedRev: 10 };
        },
      },
    });

    coordinator.scheduleSave("autosave");
    const first = await coordinator.flushSave("manual_save");
    assert.equal(first.ok, false);
    assert.equal(first.status, 409);
    assert.equal(saveCalls.length, 1);

    const second = await coordinator.flushSave("manual_save");
    assert.equal(second.ok, true);
    assert.equal(saveCalls.length, 2);
  });
});

test("queued replay keeps publish_manual_save intent marker for explicit revision action", async () => {
  await withWindowTimers(async () => {
    const store = createStore({ xml: "<bpmn:new/>", rev: 9, dirty: true, lastSavedRev: 8 });
    const reasons = [];
    const coordinator = createBpmnCoordinator({
      debounceMs: 10_000,
      store,
      getSessionId: () => "sid_publish_replay_reason",
      getRuntime: () => ({
        getStatus: () => ({ ready: true, defs: true, token: 11 }),
        getXml: async () => ({ ok: true, xml: "<bpmn:publish_retry/>", token: 11 }),
      }),
      persistence: {
        saveRaw: async (_sid, _xml, _rev, reason) => {
          reasons.push(String(reason || ""));
          if (reasons.length === 1) {
            return {
              ok: false,
              status: 500,
              error: "temporary save failure",
            };
          }
          return { ok: true, status: 200, storedRev: 10 };
        },
      },
    });

    coordinator.scheduleSave("autosave");
    const saved = await coordinator.flushSave("publish_manual_save");

    assert.equal(saved.ok, true);
    assert.deepEqual(reasons, ["publish_manual_save", "publish_manual_save:queued"]);
  });
});

test("conflict-like retry branch still preserves publish_manual_save intent marker", async () => {
  await withWindowTimers(async () => {
    const store = createStore({ xml: "<bpmn:new/>", rev: 9, dirty: true, lastSavedRev: 8 });
    const reasons = [];
    const coordinator = createBpmnCoordinator({
      debounceMs: 10_000,
      store,
      getSessionId: () => "sid_publish_conflict_like_retry",
      getRuntime: () => ({
        getStatus: () => ({ ready: true, defs: true, token: 13 }),
        getXml: async () => ({ ok: true, xml: "<bpmn:publish_conflict_like/>", token: 13 }),
      }),
      persistence: {
        saveRaw: async (_sid, _xml, _rev, reason) => {
          reasons.push(String(reason || ""));
          if (reasons.length === 1) {
            return {
              ok: false,
              status: 0,
              errorCode: "DIAGRAM_STATE_CONFLICT",
              errorDetails: {
                code: "DIAGRAM_STATE_CONFLICT",
                client_base_version: 0,
                server_current_version: 3,
              },
            };
          }
          return { ok: true, status: 200, storedRev: 10 };
        },
      },
    });

    coordinator.scheduleSave("autosave");
    const saved = await coordinator.flushSave("publish_manual_save");

    assert.equal(saved.ok, true);
    assert.deepEqual(reasons, ["publish_manual_save", "publish_manual_save:queued"]);
  });
});

test("queued replay keeps manual_save intent marker for ordinary session save", async () => {
  await withWindowTimers(async () => {
    const store = createStore({ xml: "<bpmn:new/>", rev: 9, dirty: true, lastSavedRev: 8 });
    const reasons = [];
    const coordinator = createBpmnCoordinator({
      debounceMs: 10_000,
      store,
      getSessionId: () => "sid_manual_replay_reason",
      getRuntime: () => ({
        getStatus: () => ({ ready: true, defs: true, token: 12 }),
        getXml: async () => ({ ok: true, xml: "<bpmn:manual_retry/>", token: 12 }),
      }),
      persistence: {
        saveRaw: async (_sid, _xml, _rev, reason) => {
          reasons.push(String(reason || ""));
          if (reasons.length === 1) {
            return {
              ok: false,
              status: 500,
              error: "temporary save failure",
            };
          }
          return { ok: true, status: 200, storedRev: 10 };
        },
      },
    });

    coordinator.scheduleSave("autosave");
    const saved = await coordinator.flushSave("manual_save");

    assert.equal(saved.ok, true);
    assert.deepEqual(reasons, ["manual_save", "manual_save:queued"]);
  });
});
