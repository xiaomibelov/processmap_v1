import test from "node:test";
import assert from "node:assert/strict";

import { apiPostSessionOperations, apiPutBpmnXml } from "./api.js";
import { getOrCreateClientId } from "./clientId.js";

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (UI.md §4, API.md): backend берёт
// actor_client_id из заголовка X-Client-Id / X-PM-Client-Id на POST
// /operations и PUT /bpmn — без него own-event filtering consumer'а ломается.
// Транспорт уже шлёт getClientIdHeader() (clientId.js, sessionStorage per
// tab) — файл фиксирует контракт регрессионно (characterization, GREEN).
// ---------------------------------------------------------------------------

function mockFetch(calls, responder) {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input || ""), init });
    if (typeof responder === "function") return responder(input, init);
    return new Response(JSON.stringify({ ok: true, version: 9, applied: 1, skipped: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return () => { globalThis.fetch = prevFetch; };
}

// Node-окружение без sessionStorage: getOrCreateClientId() генерирует id на
// каждый вызов — стабим sessionStorage для проверки стабильности per-tab id.
function stubSessionStorage() {
  const prevStorage = globalThis.sessionStorage;
  const data = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
  };
  return () => { globalThis.sessionStorage = prevStorage; };
}

function headersOf(call) {
  const raw = call?.init?.headers;
  if (raw instanceof Headers) return Object.fromEntries(raw.entries());
  return { ...(raw || {}) };
}

test("apiPostSessionOperations sends X-PM-Client-Id (own-event filtering contract)", async () => {
  const calls = [];
  const restore = mockFetch(calls);
  const restoreStorage = stubSessionStorage();
  try {
    const out = await apiPostSessionOperations("sess_1", {
      baseVersion: 7,
      operations: [{ opId: "op-1", type: "element.updateProperties", elementId: "Task_1" }],
    });
    assert.equal(out.ok, true);
    assert.match(calls[0].url, /\/api\/sessions\/sess_1\/operations$/);
    const headers = headersOf(calls[0]);
    assert.ok(headers["X-PM-Client-Id"] || headers["x-pm-client-id"], "X-PM-Client-Id header present");
    assert.equal(headers["X-PM-Client-Id"] || headers["x-pm-client-id"], getOrCreateClientId(), "same per-tab id as consumer filter");
  } finally {
    restoreStorage();
    restore();
  }
});

test("apiPostSessionOperations keepalive path also sends X-PM-Client-Id", async () => {
  const calls = [];
  const restore = mockFetch(calls);
  const restoreStorage = stubSessionStorage();
  try {
    await apiPostSessionOperations("sess_1", { baseVersion: 7, operations: [] }, { keepalive: true });
    const headers = headersOf(calls[0]);
    assert.ok(headers["X-PM-Client-Id"] || headers["x-pm-client-id"], "keepalive flush carries the header too");
    assert.equal(headers["X-PM-Client-Id"] || headers["x-pm-client-id"], getOrCreateClientId());
  } finally {
    restoreStorage();
    restore();
  }
});

test("apiPutBpmnXml sends the same client id header (full-save path publishes actor)", async () => {
  const calls = [];
  const restore = mockFetch(calls);
  const restoreStorage = stubSessionStorage();
  try {
    const out = await apiPutBpmnXml("sess_1", "<bpmn:definitions/>", { rev: 3, reason: "save" });
    assert.equal(out.ok, true);
    const headers = headersOf(calls[0]);
    assert.equal(headers["X-PM-Client-Id"] || headers["x-pm-client-id"], getOrCreateClientId());
  } finally {
    restoreStorage();
    restore();
  }
});
