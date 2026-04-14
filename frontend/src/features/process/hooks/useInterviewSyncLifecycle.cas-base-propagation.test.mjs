import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "useInterviewSyncLifecycle.js"), "utf8");
}

test("interview autosave and hydrate secondary patches propagate base_diagram_state_version", () => {
  const source = readSource();
  assert.equal(source.includes("getBaseDiagramStateVersion,"), true);
  assert.equal(source.includes("patchPayload.base_diagram_state_version = Math.round(baseDiagramStateVersion);"), true);
  assert.equal(source.includes("hydratePatchPayload.base_diagram_state_version = Math.round(baseDiagramStateVersion);"), true);
  assert.equal(source.includes("const patchRes = await apiPatchSession(sid, patchPayload);"), true);
  assert.equal(source.includes("const r = await apiPatchSession(sid, hydratePatchPayload);"), true);
});
