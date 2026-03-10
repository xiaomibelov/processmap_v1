import test from "node:test";
import assert from "node:assert/strict";

import { apiFetch, apiFetchWithFallback } from "./apiClient.js";

test("apiFetch: normalizes JSON error payload", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: "validation failed" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
    const out = await apiFetch({ path: "/api/test", method: "POST", body: { a: 1 } });
    assert.equal(out.ok, false);
    assert.equal(out.status, 422);
    assert.equal(out.error, "validation failed");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiFetchWithFallback: retries only on configured status (404/405)", async () => {
  const prevFetch = globalThis.fetch;
  const prevWarn = console.warn;
  const calls = [];
  const warns = [];
  try {
    console.warn = (...args) => warns.push(args);
    globalThis.fetch = async (input) => {
      calls.push(String(input || ""));
      if (calls.length === 1) {
        return new Response(JSON.stringify({ detail: "Not Found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiFetchWithFallback({
      op: "test-op",
      primaryPath: "/api/primary",
      fallbackPath: "/api/fallback",
      method: "GET",
    });
    assert.equal(out.ok, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].endsWith("/api/primary"), true);
    assert.equal(calls[1].endsWith("/api/fallback"), true);
    assert.equal(warns.length, 1);
  } finally {
    console.warn = prevWarn;
    globalThis.fetch = prevFetch;
  }
});

test("apiFetchWithFallback: does not retry when status is not eligible", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input) => {
      calls.push(String(input || ""));
      return new Response(JSON.stringify({ detail: "Gateway timeout" }), {
        status: 504,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiFetchWithFallback({
      op: "test-op-no-retry",
      primaryPath: "/api/primary",
      fallbackPath: "/api/fallback",
      method: "GET",
      fallbackStatuses: [404, 405],
    });
    assert.equal(out.ok, false);
    assert.equal(out.status, 504);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = prevFetch;
  }
});
