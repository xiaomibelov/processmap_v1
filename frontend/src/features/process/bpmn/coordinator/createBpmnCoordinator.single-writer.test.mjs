import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore from "../store/createBpmnStore.js";
import createBpmnCoordinator from "./createBpmnCoordinator.js";

test("single-writer blocks non-owner flushSave during template apply window", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"base\"/>",
    rev: 1,
    dirty: true,
    lastSavedRev: 0,
  });
  let saveCalls = 0;
  let xmlCounter = 0;
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_single_writer",
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 10 }),
      getXml: async () => ({ ok: true, xml: `<bpmn:definitions id="xml_${++xmlCounter}"/>`, token: 10 }),
    }),
    persistence: {
      saveRaw: async (_sid, _xml, rev) => {
        saveCalls += 1;
        return { ok: true, status: 200, storedRev: Number(rev || saveCalls) };
      },
    },
  });

  const claim = coordinator.beginSingleWriter("template_apply", { ttlMs: 5000, reason: "test_claim" });
  assert.equal(claim.ok, true);

  const blocked = await coordinator.flushSave("autosave");
  assert.equal(blocked.ok, true);
  assert.equal(blocked.singleWriterBlocked, true);
  assert.equal(saveCalls, 0);

  const ownerSave = await coordinator.flushSave("template_apply", { saveOwner: "template_apply" });
  assert.equal(ownerSave.ok, true);
  assert.equal(ownerSave.singleWriterBlocked, undefined);
  assert.equal(saveCalls, 1);

  const release = coordinator.endSingleWriter("template_apply", "test_release");
  assert.equal(release.ok, true);

  const unblocked = await coordinator.flushSave("autosave");
  assert.equal(unblocked.ok, true);
  assert.equal(unblocked.singleWriterBlocked, undefined);
  assert.equal(saveCalls, 2);
});

test("persistExplicitXml shares save lane lock with flushSave (no overlapping writes)", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"initial\"/>",
    rev: 3,
    dirty: true,
    lastSavedRev: 0,
  });
  let inFlight = 0;
  let maxInFlight = 0;
  const writeOrder = [];
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_lock",
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 11 }),
      getXml: async () => ({ ok: true, xml: "<bpmn:definitions id=\"runtime\"/>", token: 11 }),
    }),
    persistence: {
      saveRaw: async (_sid, xml, rev, reason) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        writeOrder.push({ xml: String(xml || ""), rev: Number(rev || 0), reason: String(reason || "") });
        await new Promise((resolve) => setTimeout(resolve, 30));
        inFlight -= 1;
        return { ok: true, status: 200, storedRev: Number(rev || 1) };
      },
    },
  });

  coordinator.beginSingleWriter("template_apply", { ttlMs: 5000, reason: "test_lock" });

  const flushPromise = coordinator.flushSave("template_apply", { saveOwner: "template_apply" });
  const explicitPromise = coordinator.persistExplicitXml(
    "<bpmn:definitions id=\"final\"/>",
    "template_apply:camunda_finalize",
    { saveOwner: "template_apply", rev: 7 },
  );
  const [flushResult, explicitResult] = await Promise.all([flushPromise, explicitPromise]);

  assert.equal(flushResult.ok, true);
  assert.equal(explicitResult.ok, true);
  assert.equal(maxInFlight, 1);
  assert.equal(writeOrder.length, 2);
  assert.match(writeOrder[0].xml, /id="runtime"/);
  assert.match(writeOrder[1].xml, /id="final"/);
});
