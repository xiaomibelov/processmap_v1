import test from "node:test";
import assert from "node:assert/strict";
import {
  accumulateCamundaDraftOps,
  camundaPropertyRowSignature,
  createCamundaDraftOps,
  mergeCamundaDraftWithFresh,
  readCamundaDraftCacheEntry,
  readExtensionPropertyRows,
  shouldApplyExternalEditToken,
} from "./camundaExtensionDraftMerge.js";

function stateWithRows(rows, listeners = []) {
  return {
    properties: {
      extensionProperties: rows.map((row, index) => ({
        id: row.id || `prop_${index + 1}`,
        name: row.name,
        value: row.value,
      })),
      extensionListeners: listeners,
    },
    preservedExtensionElements: [],
  };
}

function rowsOf(draft) {
  return readExtensionPropertyRows(draft).map((row) => ({ name: row.name, value: row.value }));
}

test("row signature uses name + NUL + value (no space-collision)", () => {
  const a = camundaPropertyRowSignature({ name: "a b", value: "c" });
  const b = camundaPropertyRowSignature({ name: "a", value: "b c" });
  assert.notEqual(a, b);
  assert.ok(a.includes(String.fromCharCode(0)));
});

test("accumulate: identical drafts produce no ops", () => {
  const ops = createCamundaDraftOps();
  const prev = stateWithRows([{ name: "a", value: "1" }]);
  const next = stateWithRows([{ name: "a", value: "1" }]);
  accumulateCamundaDraftOps(ops, prev, next);
  assert.equal(ops.upserts.size, 0);
  assert.equal(ops.removedSigs.size, 0);
});

test("accumulate: value edit is remove-old + add-new; rename likewise", () => {
  const ops = createCamundaDraftOps();
  const prev = stateWithRows([{ name: "a", value: "1" }]);
  const edited = stateWithRows([{ name: "a", value: "2" }]);
  accumulateCamundaDraftOps(ops, prev, edited);
  assert.equal(ops.upserts.size, 1);
  assert.equal(ops.removedSigs.size, 1);
  assert.ok(ops.removedSigs.has(camundaPropertyRowSignature({ name: "a", value: "1" })));
  assert.ok(ops.upserts.has(camundaPropertyRowSignature({ name: "a", value: "2" })));

  // Rename a:2 -> b:2 nets against the model baseline [a:1]: the transient
  // a:2 upsert cancels, leaving removed(a:1) + upserted(b:2).
  const renamed = stateWithRows([{ name: "b", value: "2" }]);
  accumulateCamundaDraftOps(ops, edited, renamed);
  assert.ok(ops.removedSigs.has(camundaPropertyRowSignature({ name: "a", value: "1" })));
  assert.ok(!ops.removedSigs.has(camundaPropertyRowSignature({ name: "a", value: "2" })));
  assert.ok(ops.upserts.has(camundaPropertyRowSignature({ name: "b", value: "2" })));
  assert.equal(ops.upserts.size, 1);
  assert.equal(ops.removedSigs.size, 1);
});

test("accumulate: add and delete rows tracked, reverting an edit clears its op", () => {
  const ops = createCamundaDraftOps();
  const base = stateWithRows([{ name: "a", value: "1" }]);
  const added = stateWithRows([{ name: "a", value: "1" }, { name: "c", value: "3" }]);
  accumulateCamundaDraftOps(ops, base, added);
  assert.equal(ops.upserts.size, 1);
  assert.equal(ops.removedSigs.size, 0);
  // revert the add
  accumulateCamundaDraftOps(ops, added, base);
  assert.equal(ops.upserts.size, 0);
  assert.equal(ops.removedSigs.size, 0);

  const deleted = stateWithRows([]);
  accumulateCamundaDraftOps(ops, base, deleted);
  assert.equal(ops.removedSigs.size, 1);
  // revert the delete
  accumulateCamundaDraftOps(ops, deleted, base);
  assert.equal(ops.removedSigs.size, 0);
  assert.equal(ops.upserts.size, 0);
});

test("merge: no cache entry semantics — empty ops yield the fresh rows", () => {
  const fresh = stateWithRows([{ name: "a", value: "fresh" }]);
  const merged = mergeCamundaDraftWithFresh(fresh, null, null);
  assert.deepEqual(rowsOf(merged), [{ name: "a", value: "fresh" }]);
});

test("merge: user edited row A, popover edited row B → typed A + fresh B", () => {
  const original = stateWithRows([{ name: "a", value: "1" }, { name: "b", value: "2" }]);
  const typed = stateWithRows([{ name: "a", value: "typed" }, { name: "b", value: "2" }]);
  const ops = accumulateCamundaDraftOps(null, original, typed);
  const fresh = stateWithRows([{ name: "a", value: "1" }, { name: "b", value: "popover" }]);
  const merged = mergeCamundaDraftWithFresh(fresh, typed, ops);
  assert.deepEqual(rowsOf(merged), [
    { name: "a", value: "typed" },
    { name: "b", value: "popover" },
  ]);
});

test("merge: same-name conflict resolves to the user's typed row without duplicates", () => {
  const original = stateWithRows([{ name: "a", value: "1" }]);
  const typed = stateWithRows([{ name: "a", value: "typed" }]);
  const ops = accumulateCamundaDraftOps(null, original, typed);
  const fresh = stateWithRows([{ name: "a", value: "popover" }]);
  const merged = mergeCamundaDraftWithFresh(fresh, typed, ops);
  assert.deepEqual(rowsOf(merged), [{ name: "a", value: "typed" }]);
});

test("merge: unsaved delete survives external write to another row", () => {
  const original = stateWithRows([{ name: "a", value: "1" }, { name: "c", value: "3" }]);
  const typed = stateWithRows([{ name: "a", value: "1" }]);
  const ops = accumulateCamundaDraftOps(null, original, typed);
  const fresh = stateWithRows([{ name: "a", value: "popover" }, { name: "c", value: "3" }]);
  const merged = mergeCamundaDraftWithFresh(fresh, typed, ops);
  assert.deepEqual(rowsOf(merged), [{ name: "a", value: "popover" }]);
});

test("merge: unsaved new row is appended; unsaved listeners survive; preserved elements come from fresh", () => {
  const original = stateWithRows([{ name: "a", value: "1" }]);
  const typed = stateWithRows(
    [{ name: "a", value: "1" }, { name: "d", value: "4" }],
    [{ id: "listener_1", event: "start", type: "expression", value: "${x}" }],
  );
  const ops = accumulateCamundaDraftOps(null, original, typed);
  const fresh = {
    ...stateWithRows([{ name: "a", value: "popover" }]),
    preservedExtensionElements: [{ $type: "camunda:InputOutput" }],
  };
  const merged = mergeCamundaDraftWithFresh(fresh, typed, ops);
  assert.deepEqual(rowsOf(merged), [
    { name: "a", value: "popover" },
    { name: "d", value: "4" },
  ]);
  assert.equal(merged.properties.extensionListeners.length, 1);
  assert.equal(merged.preservedExtensionElements.length, 1);
});

test("merge: ops are replayed repeatedly across consecutive external writes", () => {
  const original = stateWithRows([{ name: "a", value: "1" }, { name: "b", value: "2" }]);
  const typed = stateWithRows([{ name: "a", value: "typed" }, { name: "b", value: "2" }]);
  const ops = accumulateCamundaDraftOps(null, original, typed);
  const fresh1 = stateWithRows([{ name: "a", value: "1" }, { name: "b", value: "p1" }]);
  const merged1 = mergeCamundaDraftWithFresh(fresh1, typed, ops);
  assert.deepEqual(rowsOf(merged1), [{ name: "a", value: "typed" }, { name: "b", value: "p1" }]);
  const fresh2 = stateWithRows([{ name: "a", value: "1" }, { name: "b", value: "p2" }]);
  const merged2 = mergeCamundaDraftWithFresh(fresh2, merged1, ops);
  assert.deepEqual(rowsOf(merged2), [{ name: "a", value: "typed" }, { name: "b", value: "p2" }]);
});

test("cache entry reader accepts new shape, legacy plain draft, and garbage", () => {
  assert.equal(readCamundaDraftCacheEntry(null), null);
  assert.equal(readCamundaDraftCacheEntry("nope"), null);

  const legacy = stateWithRows([{ name: "a", value: "1" }]);
  const legacyEntry = readCamundaDraftCacheEntry(legacy);
  assert.equal(legacyEntry.draft, legacy);
  assert.equal(legacyEntry.ops.upserts.size, 0);

  const ops = createCamundaDraftOps();
  const entry = readCamundaDraftCacheEntry({ draft: legacy, ops });
  assert.equal(entry.draft, legacy);
  assert.equal(entry.ops, ops);

  const garbage = readCamundaDraftCacheEntry({ draft: legacy, ops: { upserts: "no" } });
  assert.equal(garbage.ops.upserts.size, 0);
});

test("token gate: applies once, only for the viewed element", () => {
  const token = { seq: 3, elementId: "Task_1" };
  assert.equal(shouldApplyExternalEditToken(token, 0, "Task_1"), true);
  // same seq again → already consumed
  assert.equal(shouldApplyExternalEditToken(token, 3, "Task_1"), false);
  // token targets another element → stays pending, does not consume
  assert.equal(shouldApplyExternalEditToken(token, 0, "Task_2"), false);
  // later token for the viewed element applies
  assert.equal(shouldApplyExternalEditToken({ seq: 4, elementId: "Task_1" }, 3, "Task_1"), true);
  // garbage tokens never apply
  assert.equal(shouldApplyExternalEditToken(null, 0, "Task_1"), false);
  assert.equal(shouldApplyExternalEditToken({ seq: 0, elementId: "Task_1" }, 0, "Task_1"), false);
  assert.equal(shouldApplyExternalEditToken({ seq: 5 }, 0, "Task_1"), false);
  assert.equal(shouldApplyExternalEditToken({ seq: 5, elementId: "Task_1" }, 0, ""), false);
});
