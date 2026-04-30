import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "useDiagramMutationLifecycle.js"), "utf8");
}

test("diagram mutation autosave propagates base_diagram_state_version to secondary session patch", () => {
  const source = readSource();

  assert.equal(
    source.includes("resolveDiagramMutationSecondaryPatchBaseVersion({"),
    true,
  );
  assert.equal(
    source.includes("getBaseDiagramStateVersion,"),
    true,
  );
  assert.equal(
    source.includes("rememberDiagramStateVersion,"),
    true,
  );
  assert.equal(
    source.includes("base_diagram_state_version: secondaryBaseDiagramStateVersion,"),
    true,
  );
  assert.equal(
    source.includes("const patchRes = await enqueueSessionPatchCasWrite({"),
    true,
  );
  assert.equal(source.includes("patch: patchPayload,"), true);
  assert.equal(source.includes("apiPatchSession,"), true);
});
