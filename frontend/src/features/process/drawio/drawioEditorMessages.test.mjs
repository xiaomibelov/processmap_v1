import assert from "node:assert/strict";
import test from "node:test";

import { shouldMarkDirtyOnEditorEvent } from "./drawioEditorMessages.js";

test("load event does NOT mark the editor dirty (it is the initial document load)", () => {
  assert.equal(shouldMarkDirtyOnEditorEvent("load"), false);
  assert.equal(shouldMarkDirtyOnEditorEvent("init"), false);
  assert.equal(shouldMarkDirtyOnEditorEvent("configure"), false);
});

test("autosave event marks the editor dirty (user edit notification)", () => {
  assert.equal(shouldMarkDirtyOnEditorEvent("autosave"), true);
  assert.equal(shouldMarkDirtyOnEditorEvent("AUTOSAVE"), true);
});

test("save/export/exit are lifecycle events, not dirty signals", () => {
  assert.equal(shouldMarkDirtyOnEditorEvent("save"), false);
  assert.equal(shouldMarkDirtyOnEditorEvent("export"), false);
  assert.equal(shouldMarkDirtyOnEditorEvent("exit"), false);
  assert.equal(shouldMarkDirtyOnEditorEvent(""), false);
});
