import test from "node:test";
import assert from "node:assert/strict";

import { apiAdminGetErrorEvent, apiAdminListErrorEvents } from "./api.js";

test("apiAdminListErrorEvents: requests admin error-events list with filter query params", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(JSON.stringify({ ok: true, items: [{ id: "evt_1" }], count: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiAdminListErrorEvents({
      request_id: "req_1",
      session_id: "sess_1",
      runtime_id: "rt_1",
      event_type: "backend_exception",
      source: "backend",
      severity: "error",
      occurred_from: 100,
      occurred_to: 200,
      limit: 50,
      order: "asc",
    });

    assert.equal(out.ok, true);
    assert.equal(out.data.count, 1);
    assert.equal(String(calls[0].init?.method || ""), "GET");
    const url = new URL(calls[0].url, "http://local");
    assert.equal(url.pathname, "/api/admin/error-events");
    assert.equal(url.searchParams.get("request_id"), "req_1");
    assert.equal(url.searchParams.get("session_id"), "sess_1");
    assert.equal(url.searchParams.get("runtime_id"), "rt_1");
    assert.equal(url.searchParams.get("event_type"), "backend_exception");
    assert.equal(url.searchParams.get("source"), "backend");
    assert.equal(url.searchParams.get("severity"), "error");
    assert.equal(url.searchParams.get("occurred_from"), "100");
    assert.equal(url.searchParams.get("occurred_to"), "200");
    assert.equal(url.searchParams.get("limit"), "50");
    assert.equal(url.searchParams.get("order"), "asc");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiAdminGetErrorEvent: requests exact event detail endpoint", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(JSON.stringify({ ok: true, item: { id: "evt_backend" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiAdminGetErrorEvent("evt_backend");

    assert.equal(out.ok, true);
    assert.equal(out.data.item.id, "evt_backend");
    assert.match(calls[0].url, /\/api\/admin\/error-events\/evt_backend$/);
    assert.equal(String(calls[0].init?.method || ""), "GET");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiAdminGetErrorEvent: rejects missing event_id without fetch", async () => {
  const prevFetch = globalThis.fetch;
  let called = false;
  try {
    globalThis.fetch = async () => {
      called = true;
      return new Response("{}", { status: 200 });
    };
    const out = await apiAdminGetErrorEvent("");
    assert.equal(out.ok, false);
    assert.equal(out.error, "missing event_id");
    assert.equal(called, false);
  } finally {
    globalThis.fetch = prevFetch;
  }
});
