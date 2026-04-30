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

test("ProcessStage sends restore CAS base and remembers restored diagram version before secondary patch", () => {
  const source = readSource();
  const restoreCallIdx = source.indexOf("const restored = await apiRestoreBpmnVersion(sid, versionId, {");
  const rememberIdx = source.indexOf("rememberDiagramStateVersion(restoredDiagramStateVersion, { sessionId: sid });");
  const secondaryPatchIdx = source.indexOf("const syncRes = await apiPatchSession(sid, syncPatchPayload);", restoreCallIdx);

  assert.notEqual(restoreCallIdx, -1);
  assert.notEqual(rememberIdx, -1);
  assert.notEqual(secondaryPatchIdx, -1);
  assert.ok(source.includes("baseDiagramStateVersion: restoreBaseDiagramStateVersion"));
  assert.ok(restoreCallIdx < rememberIdx);
  assert.ok(rememberIdx < secondaryPatchIdx);
  assert.ok(source.includes("toBpmnRestoreUserFacingError(restored"));
});

test("template apply companion persist rebases camunda meta from saved XML and latest diagram version", () => {
  const source = readSource();
  assert.match(
    source,
    /return persistSessionCompanion\(nextCompanion, \{\s*source: `\$\{source\}_session_companion`,\s*savedXml: xml,\s*baseDiagramStateVersion: diagramStateVersion,\s*\}\);/,
  );
  assert.match(
    source,
    /diagramStateVersion: Number\(saved\?\.diagramStateVersion \|\| getBaseDiagramStateVersion\(\) \|\| 0\),/,
  );
});
