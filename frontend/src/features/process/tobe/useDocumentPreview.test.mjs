import assert from "node:assert/strict";
import test from "node:test";

import { documentPreviewReducer } from "./useDocumentPreview.js";

const docA = { id: "doc-a", title: "Doc A", url: "https://docs.google.com/document/d/AAA/edit", docId: "AAA" };
const docB = { id: "doc-b", title: "Doc B", url: "https://docs.google.com/document/d/BBB/edit", docId: "BBB" };

const initial = { doc: null, view: null, anchorRect: null, anchorElementName: "" };

test("open defaults to popover view with anchor data", () => {
  const rect = { left: 10, top: 20, bottom: 60 };
  const next = documentPreviewReducer(initial, {
    type: "open",
    doc: docA,
    anchorRect: rect,
    anchorElementName: "Task 1",
  });
  assert.equal(next.doc, docA);
  assert.equal(next.view, "popover");
  assert.equal(next.anchorRect, rect);
  assert.equal(next.anchorElementName, "Task 1");
});

test("open with view=modal opens the modal directly", () => {
  const next = documentPreviewReducer(initial, { type: "open", doc: docA, view: "modal" });
  assert.equal(next.view, "modal");
});

test("open without a doc keeps the current state", () => {
  const next = documentPreviewReducer(initial, { type: "open", doc: null });
  assert.equal(next, initial);
});

test("expand and collapse switch between modal and popover", () => {
  let state = documentPreviewReducer(initial, { type: "open", doc: docA });
  state = documentPreviewReducer(state, { type: "expand" });
  assert.equal(state.view, "modal");
  state = documentPreviewReducer(state, { type: "collapse" });
  assert.equal(state.view, "popover");
  assert.equal(state.doc, docA, "collapse keeps the document");
});

test("expand/collapse without an open document are no-ops", () => {
  assert.equal(documentPreviewReducer(initial, { type: "expand" }), initial);
  assert.equal(documentPreviewReducer(initial, { type: "collapse" }), initial);
});

test("close resets everything", () => {
  let state = documentPreviewReducer(initial, { type: "open", doc: docA, view: "modal" });
  state = documentPreviewReducer(state, { type: "close" });
  assert.deepEqual(state, initial);
});

test("opening another document replaces the current one", () => {
  let state = documentPreviewReducer(initial, {
    type: "open",
    doc: docA,
    anchorRect: { left: 1, top: 1, bottom: 2 },
    anchorElementName: "Task 1",
  });
  state = documentPreviewReducer(state, { type: "open", doc: docB, view: "modal" });
  assert.equal(state.doc, docB);
  assert.equal(state.view, "modal");
  assert.equal(state.anchorRect, null, "stale anchor data is dropped");
  assert.equal(state.anchorElementName, "");
});

test("unknown action keeps state", () => {
  const state = documentPreviewReducer(initial, { type: "open", doc: docA });
  assert.equal(documentPreviewReducer(state, { type: "nope" }), state);
});
