import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

test("returnToSessionList force-closes the left sidebar before clearing the draft", () => {
  const returnIndex = source.indexOf('async function returnToSessionList(reason = "manual_return", options = {}) {');
  const closeCallIndex = source.indexOf("closeLeftSidebar(", returnIndex);
  const resetDraftIndex = source.indexOf("resetDraft(ensureDraftShape(null));", returnIndex);
  const controllerImport = source.indexOf("useAppShellController");

  assert.notEqual(returnIndex, -1);
  assert.notEqual(closeCallIndex, -1);
  assert.notEqual(resetDraftIndex, -1);
  assert.notEqual(controllerImport, -1);
  assert.ok(closeCallIndex < resetDraftIndex);
});
