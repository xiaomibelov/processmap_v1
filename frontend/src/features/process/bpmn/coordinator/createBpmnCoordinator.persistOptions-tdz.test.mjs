import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore from "../store/createBpmnStore.js";
import createBpmnCoordinator from "./createBpmnCoordinator.js";

test("flushSave fallback path does not throw ReferenceError when runtime is not ready", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id='fallback'/>",
    rev: 3,
    dirty: true,
    lastSavedRev: 0,
  });

  let savedArgs = null;
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_not_ready_fallback",
    getRuntime: () => ({
      getStatus: () => ({ ready: false, defs: false, token: 0 }),
    }),
    persistence: {
      saveRaw: async (sid, xml, rev, reason, options) => {
        savedArgs = { sid, xml, rev, reason, options };
        return { ok: true, status: 200, storedRev: 4 };
      },
    },
  });

  const result = await coordinator.flushSave("manual_save");

  assert.equal(result.ok, true);
  assert.equal(result.pending, true);
  assert.ok(savedArgs, "saveRaw should have been called in fallback path");
  assert.equal(savedArgs.xml, "<bpmn:definitions id='fallback'/>");
  assert.equal(typeof savedArgs.options, "object", "persistOptions must be defined when saveRaw is called");
});
