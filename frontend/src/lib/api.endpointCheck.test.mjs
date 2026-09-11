import test from "node:test";
import assert from "node:assert/strict";

import { getRun, getRuns, getStatus, runCheck } from "./apiModules/endpointCheckApi.js";

function mockFetch(handler) {
  const prevFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input || ""), init });
    return handler(input, init);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = prevFetch;
    },
  };
}

test("runCheck: POST /api/admin/endpoint-check/run", async () => {
  const mock = mockFetch(() => new Response(JSON.stringify({ run_id: "run_1", status: "pending", trigger: "manual" }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  }));
  try {
    const out = await runCheck();
    assert.equal(out.ok, true);
    assert.equal(out.data.run_id, "run_1");
    assert.equal(String(mock.calls[0].init?.method || ""), "POST");
    const url = new URL(mock.calls[0].url, "http://local");
    assert.equal(url.pathname, "/api/admin/endpoint-check/run");
  } finally {
    mock.restore();
  }
});

test("runCheck: 409 scan_already_running прокидывается наверх с status и data", async () => {
  const mock = mockFetch(() => new Response(JSON.stringify({ detail: "scan_already_running", run_id: "run_active" }), {
    status: 409,
    headers: { "Content-Type": "application/json" },
  }));
  try {
    const out = await runCheck();
    assert.equal(out.ok, false);
    assert.equal(Number(out.status), 409);
    assert.equal(String(out.data?.detail || ""), "scan_already_running");
    assert.equal(String(out.data?.run_id || ""), "run_active");
  } finally {
    mock.restore();
  }
});

test("getStatus: GET /api/admin/endpoint-check/status", async () => {
  const mock = mockFetch(() => new Response(JSON.stringify({ active: null, last_run: null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
  try {
    const out = await getStatus();
    assert.equal(out.ok, true);
    assert.equal(out.data.active, null);
    const url = new URL(mock.calls[0].url, "http://local");
    assert.equal(url.pathname, "/api/admin/endpoint-check/status");
    assert.equal(String(mock.calls[0].init?.method || ""), "GET");
  } finally {
    mock.restore();
  }
});

test("getRuns: передаёт limit/offset query-параметрами", async () => {
  const mock = mockFetch(() => new Response(JSON.stringify({ items: [], total: 0 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
  try {
    const out = await getRuns({ limit: 10, offset: 20 });
    assert.equal(out.ok, true);
    const url = new URL(mock.calls[0].url, "http://local");
    assert.equal(url.pathname, "/api/admin/endpoint-check/runs");
    assert.equal(url.searchParams.get("limit"), "10");
    assert.equal(url.searchParams.get("offset"), "20");
  } finally {
    mock.restore();
  }
});

test("getRun: запрашивает детальный эндпоинт прогона", async () => {
  const mock = mockFetch(() => new Response(JSON.stringify({
    run: { id: "run_9" },
    results: [],
    not_scanned: { count: 0, operation_ids: [] },
    blind_zone: [],
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
  try {
    const out = await getRun("run_9");
    assert.equal(out.ok, true);
    assert.match(mock.calls[0].url, /\/api\/admin\/endpoint-check\/runs\/run_9$/);
  } finally {
    mock.restore();
  }
});

test("getRun: пустой run_id отклоняется без fetch", async () => {
  const mock = mockFetch(() => new Response("{}", { status: 200 }));
  try {
    const out = await getRun("");
    assert.equal(out.ok, false);
    assert.equal(out.error, "missing run_id");
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});
