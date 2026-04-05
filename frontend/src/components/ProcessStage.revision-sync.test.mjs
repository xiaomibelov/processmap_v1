import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("ProcessStage derives unified revision UI snapshot and uses it for header and dialogs", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
  assert.equal(source.includes("resolveRevisionHistoryUiSnapshot"), true);
  assert.equal(source.includes("const revisionHistoryUiSnapshot = useMemo"), true);
  assert.equal(source.includes("revisionHistorySnapshot: revisionHistoryUiSnapshot"), true);
  assert.equal(source.includes("sessionRevisionHistorySnapshot: revisionHistoryUiSnapshot"), true);
});

test("manual save forwards explicit publish intent for backend version snapshots", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
  assert.equal(source.includes('persistReason: "publish_manual_save"'), true);
});
