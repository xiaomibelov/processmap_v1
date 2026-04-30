import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./BpmnStage.jsx", import.meta.url), "utf8");

test("BpmnStage session-meta boundary patch propagates base_diagram_state_version", () => {
  assert.equal(
    source.includes("syncPatchPayload.base_diagram_state_version = Math.round(baseDiagramStateVersion);"),
    true,
  );
  assert.equal(source.includes("const syncRes = await enqueueSessionPatchCasWrite({"), true);
  assert.equal(source.includes("patch: syncPatchPayload,"), true);
});
