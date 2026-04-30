import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "useProcessTabs.js"), "utf8");
}

test("tab-switch interview sync propagates base_diagram_state_version into secondary session patch", () => {
  const source = readSource();
  assert.equal(source.includes("getBaseDiagramStateVersion,"), true);
  assert.equal(source.includes("rememberDiagramStateVersion,"), true);
  assert.equal(
    source.includes("syncPatch.base_diagram_state_version = Math.round(baseDiagramStateVersion);"),
    true,
  );
  assert.equal(source.includes("const syncRes = await enqueueSessionPatchCasWrite({"), true);
  assert.equal(source.includes("patch: syncPatch,"), true);
});
