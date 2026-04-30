import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readInterviewSyncSource() {
  return fs.readFileSync(path.join(__dirname, "useInterviewSyncLifecycle.js"), "utf8");
}

function readPersistenceSource() {
  return fs.readFileSync(path.join(__dirname, "../bpmn/persistence/createBpmnPersistence.js"), "utf8");
}

test("L1 semantic primary-write guard is defined and blocks semantic lane", () => {
  const source = readInterviewSyncSource();
  assert.equal(source.includes("export function shouldBlockInterviewSemanticPrimaryWrite"), true);
  assert.equal(source.includes("return !isNonSemanticInterviewAllowlistPatch"), true);
  assert.equal(source.includes("if (semanticPrimaryWriteBlocked) {"), true);
  assert.equal(source.includes('traceProcess("interview.autosave_semantic_primary_write_blocked"'), true);
});

test("L1 non-semantic allowlist for ai questions is preserved", () => {
  const source = readInterviewSyncSource();
  assert.equal(source.includes("export function isNonSemanticInterviewAllowlistPatch"), true);
  assert.equal(source.includes("mutationType === \"diagram.ai_questions_by_element.update\""), true);
  assert.equal(source.includes("key === \"ai_questions_by_element\" || key === \"aiQuestionsByElementId\""), true);
});

test("L1 non-semantic allowlist for report_build_debug is preserved", () => {
  const source = readInterviewSyncSource();
  assert.equal(source.includes("mutationType === \"paths.report_build_debug.update\""), true);
  assert.equal(source.includes("key === \"report_build_debug\""), true);
  assert.equal(source.includes("const patchRes = await enqueueSessionPatchCasWrite({"), true);
});

test("canonical XML-first writer path remains intact", () => {
  const source = readPersistenceSource();
  assert.equal(source.includes("async function saveRaw(sessionId, xmlText, rev, reason = \"save\")"), true);
  assert.equal(source.includes("const saved = await apiPutBpmnXml(sid, xml, {"), true);
});
