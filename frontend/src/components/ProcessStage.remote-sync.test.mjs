import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("ProcessStage exposes diagram-level stale/apply remote BPMN sync indicator", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
  assert.equal(source.includes("sessionRemoteSyncState = null"), true);
  assert.equal(source.includes("onApplySessionRemoteSync = null"), true);
  assert.equal(source.includes("data-testid=\"processstage-diagram-remote-sync-stale\""), true);
  assert.equal(source.includes("data-testid=\"processstage-diagram-remote-sync-apply\""), true);
  assert.equal(source.includes("showDiagramRemoteSyncStale"), true);
});

test("AppShell forwards remote sync controls to ProcessStage", () => {
  const source = fs.readFileSync(path.join(__dirname, "AppShell.jsx"), "utf8");
  assert.equal(source.includes("sessionRemoteSyncState={sessionRemoteSyncState}"), true);
  assert.equal(source.includes("onApplySessionRemoteSync={onApplySessionRemoteSync}"), true);
});
