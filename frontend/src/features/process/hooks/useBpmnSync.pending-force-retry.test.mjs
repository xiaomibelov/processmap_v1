import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "useBpmnSync.js"), "utf8");
}

test("force save retries pending saveLocal result before returning pending outcome", () => {
  const source = readSource();
  assert.equal(source.includes("let pendingRetryAttempt = 0;"), true);
  assert.equal(source.includes("saved.pending === true"), true);
  assert.equal(source.includes("pendingRetryAttempt < 3"), true);
  assert.equal(source.includes("saveLocal({ force, source, persistReason })"), true);
  assert.equal(source.includes('logBpmnTrace("FLUSH_SAVE_PENDING_RETRY_DONE"'), true);
});
