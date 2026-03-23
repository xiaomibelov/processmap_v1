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
  const revisionLabelIdx = source.indexOf("const revisionLabel = `R${Math.max(0, latestRevisionNumber)}`;");
  const unpublishedIdx = source.indexOf("Unpublished");
  const legacyNoRevisionIdx = source.indexOf("No published revision");
  const revisionBadgeIdx = source.indexOf("data-testid=\"diagram-toolbar-latest-revision\"");
  assert.ok(guardIdx !== -1, "hasSession visibility guard must exist");
  assert.ok(revisionLabelIdx !== -1, "Revision label must be normalized as R0/R1/...");
  assert.ok(unpublishedIdx !== -1, "Unpublished label must exist");
  assert.ok(revisionBadgeIdx !== -1, "Revision badge must stay visible for active session");
  assert.equal(legacyNoRevisionIdx, -1, "Legacy 'No published revision' copy must be removed");
});
