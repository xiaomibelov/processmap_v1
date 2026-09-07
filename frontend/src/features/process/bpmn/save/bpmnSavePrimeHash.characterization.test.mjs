import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-hot-path-v1 (коммит 4): prime hash.
//
// RC7: после успешного собственного flush/save lastModelerXmlHashRef должен
// быть выставлен в fnv1aHex(сохранённого XML) по аналогии с template-insert
// (BpmnStage.jsx). К1/К2 подняли unformatted-снапшоты staging'а в store —
// без priming'а пост-save синк с formatted-XML даёт mismatch хэша и полный
// re-import (white flash на больших диаграммах). Source-contract: BpmnStage
// не импортируется в node --test (React), фиксируем вызовы на исходнике.
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readBpmnStageSource() {
  return fs.readFileSync(
    path.join(__dirname, "../../../../components/process/BpmnStage.jsx"),
    "utf8",
  );
}

test("source contract: persistXmlSnapshot primes lastModelerXmlHashRef with fnv1a of saved XML", () => {
  const source = readBpmnStageSource();
  const persistStart = source.indexOf("async function persistXmlSnapshot(");
  assert.ok(persistStart !== -1, "persistXmlSnapshot must exist");
  const body = source.slice(persistStart, persistStart + 4000);
  const primeIdx = body.indexOf("lastModelerXmlHashRef.current = fnv1aHex(out);");
  assert.ok(primeIdx !== -1, "persistXmlSnapshot must prime lastModelerXmlHashRef with fnv1aHex(out)");
  const savedIdx = body.indexOf("(saved)");
  assert.ok(savedIdx !== -1, "persistXmlSnapshot success path must mark the snapshot as saved");
  assert.ok(primeIdx < savedIdx, "prime must happen before applyXmlSnapshot(...(saved))");
});

test("source contract: saveLocalFromModeler success path primes the hash of the flushed XML", () => {
  const source = readBpmnStageSource();
  const flushStart = source.indexOf("async function saveLocalFromModeler(");
  assert.ok(flushStart !== -1, "saveLocalFromModeler must exist");
  const body = source.slice(flushStart, flushStart + 12000);
  const primeIdx = body.indexOf("lastModelerXmlHashRef.current = fnv1aHex(finalOut);");
  assert.ok(primeIdx !== -1, "saveLocalFromModeler must prime lastModelerXmlHashRef with fnv1aHex(finalOut)");
  const appliedIdx = body.indexOf("applyXmlSnapshot(finalOut, hint);");
  assert.ok(appliedIdx !== -1, "success path must apply the saved snapshot");
  assert.ok(primeIdx < appliedIdx, "prime must happen before applyXmlSnapshot(finalOut, hint)");
});

test("source contract: beforeunload/pagehide flush pending coordinator save (best-effort, in addition to trace)", () => {
  const source = readBpmnStageSource();
  const effectStart = source.indexOf('window.addEventListener("beforeunload", onBeforeUnload);');
  assert.ok(effectStart !== -1, "beforeunload/pagehide lifecycle effect must exist");
  const effectBody = source.slice(effectStart - 3500, effectStart + 1500);
  assert.ok(
    effectBody.indexOf('coordinator.flushSave("page_exit")') !== -1
      || effectBody.indexOf('void coordinator.flushSave("page_exit")') !== -1,
    "pagehide/beforeunload path must best-effort flush the coordinator",
  );
  assert.ok(
    effectBody.includes("bpmnCoordinatorRef.current"),
    "flush must reuse the existing coordinator (no creation side effects on unload)",
  );
  assert.ok(
    effectBody.includes("traceProcess(\"bpmn.lifecycle.beforeunload\""),
    "existing trace path must be preserved",
  );
});

test("source contract: priming uses the canonical shared fnv1a (bpmnXmlHash), not a local copy", () => {
  const helperSource = fs.readFileSync(
    path.join(__dirname, "../stage/runtimeHelpers/bpmnStagePureHelpers.js"),
    "utf8",
  );
  assert.ok(
    helperSource.includes('from "../../lib/bpmnXmlHash.js"'),
    "bpmnStagePureHelpers must import fnv1aHex from the shared bpmnXmlHash module",
  );
  assert.ok(
    helperSource.includes("  fnv1aHex,"),
    "bpmnStagePureHelpers must keep exporting fnv1aHex (BpmnStage import surface unchanged)",
  );
});
