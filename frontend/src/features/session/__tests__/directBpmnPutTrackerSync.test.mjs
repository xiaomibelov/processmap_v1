import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, "../../..");

/**
 * fix/save-single-writer-and-unified-cas-base (Task 3): каждый прямой
 * (вне-pipeline) вызов apiPutBpmnXml обязан синкать casVersionTracker из ack
 * через applyAckToTracker — иначе tracker-first resolver (Task 2) не видит
 * версию, записанную этим write-path'ом, и следующий pipeline-save уходит
 * со stale base -> самопроизвольный 409.
 *
 * TODO(architecture T3/T5): перевести эти сайты на rawXml pipeline и снять
 * этот guard вместе с прямыми вызовами.
 */
const DIRECT_PUT_FILES = [
  "components/ProcessStage.jsx",
  "App.jsx",
  "app/useSessionActivationOrchestration.js",
];

for (const relPath of DIRECT_PUT_FILES) {
  test(`direct apiPutBpmnXml sites sync tracker via applyAckToTracker: ${relPath}`, () => {
    const source = fs.readFileSync(path.join(SRC_ROOT, relPath), "utf8");
    const putCount = (source.match(/await apiPutBpmnXml\s*\(/g) || []).length;
    const syncCount = (source.match(/applyAckToTracker\s*\(/g) || []).length;
    assert.ok(putCount > 0, `${relPath}: expected at least one direct apiPutBpmnXml call`);
    assert.equal(
      syncCount,
      putCount,
      `${relPath}: each direct apiPutBpmnXml (${putCount}) must be paired with applyAckToTracker (${syncCount})`,
    );
  });
}
