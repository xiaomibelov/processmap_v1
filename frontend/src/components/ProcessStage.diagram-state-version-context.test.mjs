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

test("ProcessStage keeps version context via dedicated remember/sync seam", () => {
  const source = readSource();
  assert.equal(source.includes("const rememberDiagramStateVersion = useCallback"), true);
  assert.equal(source.includes("const syncDiagramStateVersionFromSession = useCallback"), true);
  assert.equal(source.includes("const onSessionSyncWithVersion = useCallback"), true);
  assert.equal(source.includes("rememberMonotonicDiagramStateVersion({"), true);
  assert.equal(source.includes("syncDiagramStateVersionFromSession(payload);"), true);
  assert.equal(source.includes("isDiagramVersionSessionMatch(currentSid, targetSid)"), true);
  assert.equal(source.includes("resolveDiagramBaseVersionForActiveSession"), true);
});

test("ProcessStage draft echo path updates version context through monotonic helper", () => {
  const source = readSource();
  const draftEffectIdx = source.indexOf("const nextVersion = resolveDraftDiagramStateVersion();");
  const helperIdx = source.indexOf("rememberMonotonicDiagramStateVersion({", draftEffectIdx);
  const directLoweringIdx = source.indexOf("diagramStateVersionRef.current = nextVersion;", draftEffectIdx);

  assert.notEqual(draftEffectIdx, -1);
  assert.notEqual(helperIdx, -1);
  assert.equal(directLoweringIdx, -1);
});

test("ProcessStage routes orchestration and overlay writes through onSessionSyncWithVersion", () => {
  const source = readSource();
  assert.equal(source.includes("onSessionSync: onSessionSyncWithVersion"), true);
  assert.equal(source.includes("getBaseDiagramStateVersion,"), true);
  assert.equal(source.includes("rememberDiagramStateVersion,"), true);
  assert.equal(source.includes("onSessionSyncWithVersion?.(serverSession);"), true);
  assert.equal(source.includes("if (!isDiagramVersionSessionMatch(currentSid, sessionSid)) return false;"), true);
});
