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
  assert.equal(source.includes("syncDiagramStateVersionFromSession(sessionLikeRaw);"), true);
});

test("ProcessStage routes orchestration and overlay writes through onSessionSyncWithVersion", () => {
  const source = readSource();
  assert.equal(source.includes("onSessionSync: onSessionSyncWithVersion"), true);
  assert.equal(source.includes("getBaseDiagramStateVersion,"), true);
  assert.equal(source.includes("rememberDiagramStateVersion,"), true);
  assert.equal(source.includes("onSessionSyncWithVersion?.(serverSession);"), true);
});
