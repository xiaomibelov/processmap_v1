import test from "node:test";
import assert from "node:assert/strict";

import {
  clearBpmnSnapshots,
  getBpmnSnapshotById,
  listBpmnSnapshots,
  saveBpmnSnapshot,
  updateBpmnSnapshotMeta,
} from "./bpmnSnapshots.js";

function createLocalStorageMock() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
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
  globalThis.window = {
    localStorage: createLocalStorageMock(),
  };
}

test("saveBpmnSnapshot stores multiple versions and prunes by limit", async () => {
  const sid = `ut_snapshots_${Date.now()}_a`;
  const projectId = "ut_project";

  await clearBpmnSnapshots({ projectId, sessionId: sid });

  await saveBpmnSnapshot({ projectId, sessionId: sid, xml: "<xml>A</xml>", rev: 1, reason: "manual_save" });
  await saveBpmnSnapshot({ projectId, sessionId: sid, xml: "<xml>B</xml>", rev: 2, reason: "manual_save" });
  await saveBpmnSnapshot({ projectId, sessionId: sid, xml: "<xml>C</xml>", rev: 3, reason: "manual_save" });

  const list = await listBpmnSnapshots({ projectId, sessionId: sid });
  assert.equal(list.length, 3);
  assert.equal(String(list[0]?.xml || ""), "<xml>C</xml>");
  assert.equal(String(list[2]?.xml || ""), "<xml>A</xml>");

  const pruned = await saveBpmnSnapshot({
    projectId,
    sessionId: sid,
    xml: "<xml>D</xml>",
    rev: 4,
    reason: "manual_save",
    limit: 2,
  });
  assert.equal(pruned.ok, true);
  assert.equal(pruned.saved, true);
  assert.equal(pruned.decisionReason, "pruned");

  const listAfterPrune = await listBpmnSnapshots({ projectId, sessionId: sid });
  assert.equal(listAfterPrune.length, 2);
  assert.equal(String(listAfterPrune[0]?.xml || ""), "<xml>D</xml>");
  assert.equal(String(listAfterPrune[1]?.xml || ""), "<xml>C</xml>");
});

test("force snapshot creates a new version even when hash is unchanged", async () => {
  const sid = `ut_snapshots_${Date.now()}_b`;
  const projectId = "ut_project";

  await clearBpmnSnapshots({ projectId, sessionId: sid });

  const first = await saveBpmnSnapshot({ projectId, sessionId: sid, xml: "<xml>SAME</xml>", rev: 1, reason: "manual_save" });
  assert.equal(first.ok, true);
  assert.equal(first.saved, true);

  const deduped = await saveBpmnSnapshot({ projectId, sessionId: sid, xml: "<xml>SAME</xml>", rev: 2, reason: "manual_save" });
  assert.equal(deduped.ok, true);
  assert.equal(deduped.saved, false);
  assert.equal(deduped.decisionReason, "skip_same_hash");

  const forced = await saveBpmnSnapshot({
    projectId,
    sessionId: sid,
    xml: "<xml>SAME</xml>",
    rev: 3,
    reason: "manual_checkpoint",
    force: true,
    label: "checkpoint",
  });
  assert.equal(forced.ok, true);
  assert.equal(forced.saved, true);

  const list = await listBpmnSnapshots({ projectId, sessionId: sid });
  assert.equal(list.length, 2);
  assert.equal(String(list[0]?.label || ""), "checkpoint");
});

test("restore lookup returns the selected snapshot", async () => {
  const sid = `ut_snapshots_${Date.now()}_c`;
  const projectId = "ut_project";

  await clearBpmnSnapshots({ projectId, sessionId: sid });
  const saved = await saveBpmnSnapshot({ projectId, sessionId: sid, xml: "<xml>RESTORE</xml>", rev: 1, reason: "manual_save" });

  const snapshotId = String(saved?.snapshot?.id || "");
  assert.notEqual(snapshotId, "");

  const restored = await getBpmnSnapshotById({ projectId, sessionId: sid, snapshotId });
  assert.equal(String(restored?.xml || ""), "<xml>RESTORE</xml>");
});

test("pinned snapshot moves to top and keeps label after reload", async () => {
  const sid = `ut_snapshots_${Date.now()}_d`;
  const projectId = "ut_project";

  await clearBpmnSnapshots({ projectId, sessionId: sid });
  const first = await saveBpmnSnapshot({ projectId, sessionId: sid, xml: "<xml>PIN_A</xml>", rev: 1, reason: "manual_save" });
  await saveBpmnSnapshot({ projectId, sessionId: sid, xml: "<xml>PIN_B</xml>", rev: 2, reason: "manual_save" });
  await saveBpmnSnapshot({ projectId, sessionId: sid, xml: "<xml>PIN_C</xml>", rev: 3, reason: "manual_save" });

  const firstId = String(first?.snapshot?.id || "").trim();
  assert.notEqual(firstId, "");

  const pinned = await updateBpmnSnapshotMeta({
    projectId,
    sessionId: sid,
    snapshotId: firstId,
    pinned: true,
    label: "Checkpoint A",
  });
  assert.equal(pinned.ok, true);
  assert.equal(pinned.updated, true);

  const list = await listBpmnSnapshots({ projectId, sessionId: sid });
  assert.equal(list.length, 3);
  assert.equal(String(list[0]?.id || ""), firstId);
  assert.equal(list[0]?.pinned, true);
  assert.equal(String(list[0]?.label || ""), "Checkpoint A");
});
