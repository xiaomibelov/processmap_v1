import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Source-level regression tests verifying AbortController signal is wired
 * through the entire save pipeline:
 *   saveCoordinator → transport(sid, payload, signal) → apiPutBpmnXml → request → apiFetch → fetch
 */

test("saveCoordinator._runTransportWithTimeout creates AbortController and passes signal to transport", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../saveCoordinator.js"), "utf8");
  assert.ok(source.includes("new AbortController()"), "must create AbortController");
  assert.ok(source.includes("controller.abort()"), "must call controller.abort() on timeout");
  assert.ok(
    source.includes("pipeline.transport(sessionId, payload, controller.signal)"),
    "must pass controller.signal as 3rd arg to transport",
  );
});

test("saveCoordinator tracks session abort controllers and aborts on clearSession", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../saveCoordinator.js"), "utf8");
  assert.ok(source.includes("_sessionAbortControllers"), "must have session abort controller store");
  assert.ok(source.includes("_abortSessionControllers"), "must have abort method");
  // clearSession must call _abortSessionControllers
  const clearIdx = source.indexOf("clearSession(sessionId)");
  assert.ok(clearIdx !== -1, "clearSession must exist");
  const clearBody = source.slice(clearIdx, clearIdx + 500);
  assert.ok(
    clearBody.includes("_abortSessionControllers"),
    "clearSession must call _abortSessionControllers",
  );
});

test("saveBpmnState xml pipeline transport accepts and forwards signal", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../process/save/saveBpmnState.js"),
    "utf8",
  );
  // The transport function must accept signal parameter.
  assert.ok(
    source.includes("transport: async (sessionId, payload, signal)"),
    "xml pipeline transport must accept signal as 3rd arg",
  );
  // Must forward signal to apiPutBpmnXml call.
  assert.ok(
    source.includes("signal,") || source.includes("signal }"),
    "transport must forward signal to apiPutBpmnXml options",
  );
});

test("createBpmnPersistence rawXml pipeline transport accepts and forwards signal", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../process/bpmn/persistence/createBpmnPersistence.js"),
    "utf8",
  );
  assert.ok(
    source.includes("transport: async (sessionId, payload, signal)"),
    "rawXml pipeline transport must accept signal as 3rd arg",
  );
  assert.ok(
    source.includes("signal }") || source.includes("signal,"),
    "rawXml pipeline must forward signal",
  );
});

test("apiPutBpmnXml forwards signal to request()", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../../lib/api.js"),
    "utf8",
  );
  const fnStart = source.indexOf("export async function apiPutBpmnXml");
  assert.ok(fnStart !== -1, "apiPutBpmnXml must exist");
  const fnBody = source.slice(fnStart, fnStart + 2000);
  assert.ok(
    fnBody.includes("signal: options.signal"),
    "apiPutBpmnXml must forward options.signal to request()",
  );
});

test("apiCore request() forwards signal to apiFetch()", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../../lib/apiCore.js"),
    "utf8",
  );
  const fnStart = source.indexOf("async function request(");
  assert.ok(fnStart !== -1, "request() must exist");
  const fnBody = source.slice(fnStart, fnStart + 1000);
  assert.ok(
    fnBody.includes("signal: opts.signal"),
    "request() must forward opts.signal to apiFetch()",
  );
});

test("apiFetch passes signal to fetch()", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../../lib/apiClient.js"),
    "utf8",
  );
  const fetchCall = source.indexOf("await fetch(url,");
  assert.ok(fetchCall !== -1, "apiFetch must call fetch()");
  const fetchBody = source.slice(fetchCall, fetchCall + 200);
  assert.ok(
    fetchBody.includes("signal"),
    "fetch() call must include signal option",
  );
});
