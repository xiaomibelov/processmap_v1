import test from "node:test";
import assert from "node:assert/strict";
import {
  clearBackendBpmnClipboard,
  copyBackendBpmnClipboard,
  pasteBackendBpmnClipboard,
  readBackendBpmnClipboard,
} from "./backendBpmnClipboardApi.js";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function installFetchStub(responsePayload = { ok: true }, { status = 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url || ""),
      method: String(options.method || "GET"),
      body: options.body ? JSON.parse(String(options.body)) : null,
    });
    return new Response(JSON.stringify(responsePayload), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return calls;
}

test("backend clipboard API client respects copy endpoint contract", async () => {
  const calls = installFetchStub({
    ok: true,
    clipboard_item_type: "bpmn_task",
    schema_version: "pm_bpmn_task_clipboard_v1",
  });

  const result = await copyBackendBpmnClipboard({
    sessionId: "Session_A",
    elementId: "Task_1",
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0]?.url, "/api/clipboard/bpmn/copy");
  assert.equal(calls[0]?.method, "POST");
  assert.deepEqual(calls[0]?.body, {
    session_id: "Session_A",
    element_id: "Task_1",
  });
});

test("backend clipboard API client respects read/paste/clear endpoint contracts", async () => {
  const calls = installFetchStub({
    ok: true,
    empty: false,
    item: {
      clipboard_item_type: "bpmn_subprocess_subtree",
      schema_version: "pm_bpmn_subprocess_subtree_clipboard_v2",
    },
  });

  const readResult = await readBackendBpmnClipboard();
  assert.equal(readResult.ok, true);
  assert.equal(calls[0]?.url, "/api/clipboard/bpmn");
  assert.equal(calls[0]?.method, "GET");

  await pasteBackendBpmnClipboard({ sessionId: "Session_B" });
  assert.equal(calls[1]?.url, "/api/clipboard/bpmn/paste");
  assert.equal(calls[1]?.method, "POST");
  assert.deepEqual(calls[1]?.body, { session_id: "Session_B" });

  await clearBackendBpmnClipboard();
  assert.equal(calls[2]?.url, "/api/clipboard/bpmn");
  assert.equal(calls[2]?.method, "DELETE");
});

test("backend clipboard API client normalizes structured backend errors", async () => {
  installFetchStub({
    detail: {
      code: "forced_clipboard_structured_error",
      message: "Clipboard item не поддерживается",
    },
  }, { status: 422 });

  const result = await pasteBackendBpmnClipboard({ sessionId: "Session_B" });

  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.error, "Clipboard item не поддерживается");
  assert.notEqual(result.error, "[object Object]");
});
