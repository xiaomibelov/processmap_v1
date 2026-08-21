import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "useBpmnDiagramContextMenu.js"), "utf8");
}

test("context menu request does not enforce temporary element-only narrowing", () => {
  const source = readSource();
  assert.equal(
    source.includes("function isElementOnlyContextTarget"),
    false,
    "element-only target helper must be removed for recovered broader contract",
  );
  assert.equal(
    source.includes("if (!isElementOnlyContextTarget(targetBase)) return false;"),
    false,
    "context menu request must not be blocked by element-only fallback narrowing",
  );
});
