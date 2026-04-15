import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("revision badges are rendered only when session is active", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStageHeader.jsx"), "utf8");
  const guardIdx = source.indexOf("{hasSession ? (");
  const revisionBadgeIdx = source.indexOf("resolvePublishedRevisionBadgeView");
  const draftSyncIdx = source.indexOf("Черновик совпадает с последней версией");
  const draftDirtyIdx = source.indexOf("Черновик новее последней версии");
  assert.ok(guardIdx !== -1, "hasSession visibility guard must exist");
  assert.ok(revisionBadgeIdx !== -1, "published revision badge resolver must be used");
  assert.ok(draftSyncIdx !== -1, "draft vs latest synced label must exist");
  assert.ok(draftDirtyIdx !== -1, "draft vs latest dirty label must exist");
  assert.equal(source.includes("latestPublishedRevisionNumber"), true);
  assert.equal(source.includes("R0"), false);
  assert.equal(source.includes("r?"), false);
  assert.equal(source.includes("r…"), false);
});
