import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

test("returnToSessionList force-closes the left sidebar before clearing the draft", () => {
  const closeFnIndex = source.indexOf("function closeLeftSidebar(source = \"sidebar_close\") {");
  const returnIndex = source.indexOf("async function returnToSessionList(reason = \"manual_return\", options = {}) {");
  const closeCallIndex = source.indexOf("closeLeftSidebar(`return_to_project:${reason}`);", returnIndex);
  const resetDraftIndex = source.indexOf("resetDraft(ensureDraftShape(null));", returnIndex);
  const persistClosedIndex = source.indexOf("window.sessionStorage?.setItem(LEFT_PANEL_OPEN_KEY, \"0\");", closeFnIndex);

  assert.notEqual(closeFnIndex, -1);
  assert.notEqual(returnIndex, -1);
  assert.notEqual(closeCallIndex, -1);
  assert.notEqual(resetDraftIndex, -1);
  assert.notEqual(persistClosedIndex, -1);
  assert.ok(closeFnIndex < returnIndex);
  assert.ok(closeCallIndex < resetDraftIndex);
});
