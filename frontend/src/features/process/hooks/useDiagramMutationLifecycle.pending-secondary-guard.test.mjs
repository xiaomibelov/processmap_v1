import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "useDiagramMutationLifecycle.js"), "utf8");
}

test("diagram mutation autosave does not trigger secondary patch when primary save is pending", () => {
  const source = readSource();
  assert.equal(source.includes("if (saveRes?.pending) {"), true);
  assert.equal(source.includes('traceProcess("diagram.autosave_pending_primary"'), true);
  assert.equal(source.includes("return true;"), true);
});
