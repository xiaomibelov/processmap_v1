import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "useProcessOrchestrator.js"), "utf8");
}

test("orchestrator forwards getBaseDiagramStateVersion into tabs and interview lifecycles", () => {
  const source = readSource();
  const mentions = source.match(/getBaseDiagramStateVersion,/g) || [];
  assert.equal(mentions.length >= 4, true);
  assert.equal(source.includes("rememberDiagramStateVersion,"), true);
});
