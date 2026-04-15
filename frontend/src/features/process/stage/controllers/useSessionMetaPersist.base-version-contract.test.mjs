import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "useSessionMetaPersist.js"), "utf8");
}

test("persistBpmnMeta forwards explicit base_diagram_state_version to write gateway", () => {
  const source = readSource();
  assert.equal(source.includes("const baseDiagramStateVersion = Number(options?.baseDiagramStateVersion);"), true);
  assert.equal(
    source.includes("baseDiagramStateVersion: Number.isFinite(baseDiagramStateVersion) && baseDiagramStateVersion >= 0"),
    true,
  );
  assert.equal(source.includes("Math.round(baseDiagramStateVersion)"), true);
});

test("persistSessionCompanion forwards base_diagram_state_version into legacy meta write", () => {
  const source = readSource();
  assert.equal(
    source.includes("legacyResult = await persistBpmnMeta(mergedMeta, {"),
    true,
  );
  assert.equal(
    source.includes("source: String(options?.source || \"session_companion_save\"),"),
    true,
  );
  assert.equal(
    source.includes("baseDiagramStateVersion: Number.isFinite(baseDiagramStateVersion) && baseDiagramStateVersion >= 0"),
    true,
  );
});
