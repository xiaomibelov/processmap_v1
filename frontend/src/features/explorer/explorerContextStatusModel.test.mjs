import test from "node:test";
import assert from "node:assert/strict";

import {
  getExplorerContextStatusLabel,
  getExplorerContextStatusOptions,
  isExplorerContextStatusEditable,
  normalizeExplorerContextStatus,
} from "./explorerContextStatusModel.js";

test("context status labels match backend durable values", () => {
  assert.equal(getExplorerContextStatusLabel("none"), "—");
  assert.equal(getExplorerContextStatusLabel("as_is"), "AS IS");
  assert.equal(getExplorerContextStatusLabel("to_be"), "TO BE");
});

test("invalid and empty context status values normalize to none", () => {
  assert.equal(normalizeExplorerContextStatus(""), "none");
  assert.equal(normalizeExplorerContextStatus(null), "none");
  assert.equal(normalizeExplorerContextStatus("draft"), "none");
  assert.equal(normalizeExplorerContextStatus("AS_IS"), "as_is");
});

test("context status options expose only allowed values", () => {
  assert.deepEqual(getExplorerContextStatusOptions(), [
    { value: "none", label: "—" },
    { value: "as_is", label: "AS IS" },
    { value: "to_be", label: "TO BE" },
  ]);
});

test("only workspace folder rows are editable", () => {
  assert.equal(isExplorerContextStatusEditable({ type: "folder" }), true);
  assert.equal(isExplorerContextStatusEditable({ type: "project" }), false);
  assert.equal(isExplorerContextStatusEditable({ type: "session" }), false);
});
