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
  const versionChipIdx = source.indexOf('data-testid="diagram-toolbar-version-chip"');
  assert.ok(guardIdx !== -1, "hasSession visibility guard must exist");
  assert.ok(revisionBadgeIdx !== -1, "published revision badge resolver must be used");
  assert.ok(versionChipIdx !== -1, "version chip must exist");
  assert.equal(source.includes("Черновик совпадает с последней версией"), false);
  assert.equal(source.includes("Черновик новее последней версии"), false);
  assert.equal(source.includes("latestPublishedRevisionNumber"), true);
  assert.equal(source.includes("V. —"), true);
  assert.equal(source.includes("R0"), false);
  assert.equal(source.includes("r?"), false);
  assert.equal(source.includes("r…"), false);
});
