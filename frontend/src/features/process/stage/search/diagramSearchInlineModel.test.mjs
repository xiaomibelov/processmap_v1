import assert from "node:assert/strict";
import test from "node:test";

import {
  isSubprocessSearchRow,
  reduceInlineSearchState,
  resolveNextSearchMode,
  resolveTypeIconKind,
} from "./diagramSearchInlineModel.js";

// Expand / collapse / clear state machine

test("reduceInlineSearchState: expand opens and keeps query", () => {
  assert.deepEqual(reduceInlineSearchState({ expanded: false, hasQuery: false }, "expand"), {
    expanded: true,
    clearQuery: false,
  });
  assert.deepEqual(reduceInlineSearchState({ expanded: false, hasQuery: true }, "expand"), {
    expanded: true,
    clearQuery: false,
  });
});

test("reduceInlineSearchState: blur collapses only when query is empty", () => {
  assert.deepEqual(reduceInlineSearchState({ expanded: true, hasQuery: false }, "blur"), {
    expanded: false,
    clearQuery: false,
  });
  assert.deepEqual(reduceInlineSearchState({ expanded: true, hasQuery: true }, "blur"), {
    expanded: true,
    clearQuery: false,
  });
});

test("reduceInlineSearchState: escape two-step clears then collapses", () => {
  assert.deepEqual(reduceInlineSearchState({ expanded: true, hasQuery: true }, "escape"), {
    expanded: true,
    clearQuery: true,
  });
  assert.deepEqual(reduceInlineSearchState({ expanded: true, hasQuery: false }, "escape"), {
    expanded: false,
    clearQuery: false,
  });
});

test("reduceInlineSearchState: select collapses and clear keeps open", () => {
  assert.deepEqual(reduceInlineSearchState({ expanded: true, hasQuery: true }, "select"), {
    expanded: false,
    clearQuery: false,
  });
  assert.deepEqual(reduceInlineSearchState({ expanded: true, hasQuery: true }, "clear"), {
    expanded: true,
    clearQuery: true,
  });
});

test("resolveNextSearchMode: explicit request wins, empty toggles", () => {
  assert.equal(resolveNextSearchMode("elements", "properties"), "properties");
  assert.equal(resolveNextSearchMode("properties", "elements"), "elements");
  assert.equal(resolveNextSearchMode("elements", ""), "properties");
  assert.equal(resolveNextSearchMode("properties", ""), "elements");
  assert.equal(resolveNextSearchMode("garbage", "properties"), "properties");
});

test("resolveTypeIconKind: maps BPMN types to visual buckets", () => {
  assert.equal(resolveTypeIconKind("bpmn:Task"), "task");
  assert.equal(resolveTypeIconKind("bpmn:ExclusiveGateway"), "gateway");
  assert.equal(resolveTypeIconKind("bpmn:SubProcess"), "subprocess");
  assert.equal(resolveTypeIconKind("bpmn:CallActivity"), "subprocess");
  assert.equal(resolveTypeIconKind("bpmn:StartEvent"), "event");
  assert.equal(resolveTypeIconKind("bpmn:SequenceFlow"), "flow");
  assert.equal(resolveTypeIconKind("bpmn:Something"), "other");
});

test("isSubprocessSearchRow: detects subprocess context and types", () => {
  assert.equal(isSubprocessSearchRow({ isInsideSubprocess: true, type: "bpmn:Task" }), true);
  assert.equal(isSubprocessSearchRow({ parentSubprocessId: "Sub_1" }), true);
  assert.equal(isSubprocessSearchRow({ subprocessPath: [{ id: "Sub_1" }] }), true);
  assert.equal(isSubprocessSearchRow({ type: "bpmn:SubProcess" }), true);
  assert.equal(isSubprocessSearchRow({ type: "bpmn:Task" }), false);
  assert.equal(isSubprocessSearchRow(null), false);
});
