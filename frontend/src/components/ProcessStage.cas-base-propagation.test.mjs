import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
}

test("ProcessStage propagates base_diagram_state_version in import/restore secondary patches", () => {
  const source = readSource();
  const baseGetterMentions = source.match(/getBaseDiagramStateVersion,/g) || [];
  assert.equal(baseGetterMentions.length >= 2, true);
  assert.equal(
    source.includes("syncPatchPayload.base_diagram_state_version = Math.round(baseDiagramStateVersion);"),
    true,
  );
  assert.equal(source.includes("const syncRes = await apiPatchSession(sid, syncPatchPayload);"), true);
});
