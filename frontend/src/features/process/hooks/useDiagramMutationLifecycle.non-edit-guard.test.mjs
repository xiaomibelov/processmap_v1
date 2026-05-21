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

test("queueDiagramMutation filters out empty commandStack.changed mutations", () => {
  const source = readSource();
  assert.equal(source.includes("isEmptyCommandStack"), true);
  assert.equal(source.includes('eventName === "commandStack.changed"'), true);
  assert.equal(source.includes("queue_mutation_skipped_non_edit"), true);
});

test("queueDiagramMutation filters out init-like sources", () => {
  const source = readSource();
  assert.equal(source.includes("isInitLikeSource"), true);
  assert.equal(source.includes("stage_init"), true);
  assert.equal(source.includes("ensure_modeler"), true);
});

test("commitDiagramAutosave still calls saveFromModeler for allowed mutation kinds", () => {
  const source = readSource();
  assert.equal(source.includes("await bpmnSync.saveFromModeler()"), true);
  assert.equal(source.includes("await bpmnSync.saveFromXmlDraft()"), true);
});
