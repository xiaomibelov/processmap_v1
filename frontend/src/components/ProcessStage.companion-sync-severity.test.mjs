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

test("manual save keeps companion sync failure as secondary warning surface", () => {
  const source = readSource();

  assert.equal(
    source.includes("resolveManualSaveOutcomeUi"),
    true,
  );
  assert.equal(
    source.includes("setGenErr(companionError);"),
    false,
  );
  assert.equal(
    source.includes("const successOutcomeUi = resolveManualSaveOutcomeUi({"),
    true,
  );
  assert.equal(
    source.includes("primarySaveOk: true,"),
    true,
  );
  assert.equal(
    source.includes("companionError,"),
    true,
  );
});
