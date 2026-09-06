import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore from "../store/createBpmnStore.js";
import createBpmnCoordinator from "./createBpmnCoordinator.js";

const XML_SAME = "<bpmn:definitions id=\"same\"/>";

function buildCoordinator({ saveCalls, reason = "autosave", initial = {} }) {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"stale\"/>",
    rev: 5,
    dirty: true,
    lastSavedRev: 0,
    ...initial,
  });
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_skip_unchanged_char",
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 91 }),
      getXml: async () => ({ ok: true, xml: XML_SAME, token: 91 }),
    }),
    persistence: {
      saveRaw: async (_sid, _xml, _rev, saveReason) => {
        saveCalls.push(String(saveReason || ""));
        return { ok: true, status: 200, storedRev: 6, hash: store?.getState?.()?.lastHash };
      },
    },
  });
  return { store, coordinator };
}

test("skip-if-unchanged no longer depends on the dirty flag: re-dirtied store with unchanged xml is skipped", async () => {
  const saveCalls = [];
  const { store, coordinator } = buildCoordinator({ saveCalls });

  // First save persists and records savedHash (hash of the flushed xml).
  const first = await coordinator.flushSave("autosave");
  assert.equal(first.ok, true);
  assert.equal(saveCalls.length, 1);

  // Staging marks the store dirty again without changing the xml (runtime snapshot / bumpRev).
  store.markDirty("runtime_change");
  const second = await coordinator.flushSave("autosave");

  assert.equal(second.skipped, true);
  assert.equal(second.unchanged, true);
  assert.equal(saveCalls.length, 1, "unchanged xml must not produce a second PUT");
});

test("skip-if-unchanged is driven by the saved xml hash, not by the dirty flag", async () => {
  const saveCalls = [];
  const { store, coordinator } = buildCoordinator({ saveCalls });

  const first = await coordinator.flushSave("autosave");
  assert.equal(first.ok, true);

  store.markDirty("runtime_change");
  const second = await coordinator.flushSave("autosave");

  assert.equal(second.skipped, true);
  assert.equal(second.unchanged, true);
  assert.equal(saveCalls.length, 1, "unchanged xml must not produce a second PUT");
});

test("property operations keep bypassing the unchanged skip (non-commutative order must persist)", async () => {
  const saveCalls = [];
  const { store, coordinator } = buildCoordinator({ saveCalls, reason: "property_update" });

  await coordinator.flushSave("autosave");
  store.markDirty("runtime_change");

  const propertyResult = await coordinator.flushSave("property_update");
  assert.equal(propertyResult.skipped, undefined);
  assert.equal(saveCalls.length, 2);
});

test("publish_manual_save keeps bypassing the unchanged skip", async () => {
  const saveCalls = [];
  const { store, coordinator } = buildCoordinator({ saveCalls });

  await coordinator.flushSave("autosave");
  store.markDirty("runtime_change");

  const publishResult = await coordinator.flushSave("publish_manual_save");
  assert.equal(publishResult.skipped, undefined);
  assert.equal(saveCalls.length, 2);
});

test("changed xml always persists regardless of the dirty flag", async () => {
  const saveCalls = [];
  const { store, coordinator } = buildCoordinator({ saveCalls });

  await coordinator.flushSave("autosave");

  const changedCoordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_skip_unchanged_char",
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 92 }),
      getXml: async () => ({ ok: true, xml: "<bpmn:definitions id=\"changed\"/>", token: 92 }),
    }),
    persistence: {
      saveRaw: async () => {
        saveCalls.push("changed");
        return { ok: true, status: 200, storedRev: 7 };
      },
    },
  });
  const changed = await changedCoordinator.flushSave("autosave");
  assert.equal(changed.skipped, undefined);
  assert.equal(saveCalls.length, 2);
});
