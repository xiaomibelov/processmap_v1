import test from "node:test";
import assert from "node:assert/strict";

import { apiGetReferenceOptions } from "./api.js";

test("apiGetReferenceOptions: normalizes bare table names to table: prefix", async () => {
  const prevFetch = globalThis.fetch;
  const prevWindow = globalThis.window;
  const requests = [];
  try {
    globalThis.window = { location: { origin: "http://localhost" } };
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      return new Response(JSON.stringify({ items: [{ id: "1", name: "Test" }], count: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const out = await apiGetReferenceOptions("ingredients", "", 100);
    assert.equal(out.ok, true);
    assert.equal(requests.length, 1);
    const pathname1 = new URL(requests[0]).pathname;
    assert.equal(decodeURIComponent(pathname1), "/api/reference/table:ingredients/options");
  } finally {
    globalThis.fetch = prevFetch;
    globalThis.window = prevWindow;
  }
});

test("apiGetReferenceOptions: keeps existing type:identifier source unchanged", async () => {
  const prevFetch = globalThis.fetch;
  const prevWindow = globalThis.window;
  const requests = [];
  try {
    globalThis.window = { location: { origin: "http://localhost" } };
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      return new Response(JSON.stringify({ items: [], count: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await apiGetReferenceOptions("table:equipment", "", 20);
    assert.equal(decodeURIComponent(new URL(requests[0]).pathname), "/api/reference/table:equipment/options");

    await apiGetReferenceOptions("org_dict:some-key", "", 20);
    assert.equal(decodeURIComponent(new URL(requests[1]).pathname), "/api/reference/org_dict:some-key/options");
  } finally {
    globalThis.fetch = prevFetch;
    globalThis.window = prevWindow;
  }
});

test("apiGetReferenceOptions: does not prefix unknown sources", async () => {
  const prevFetch = globalThis.fetch;
  const prevWindow = globalThis.window;
  const requests = [];
  try {
    globalThis.window = { location: { origin: "http://localhost" } };
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      return new Response(JSON.stringify({ items: [], count: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await apiGetReferenceOptions("custom", "", 20);
    assert.ok(requests[0].includes("/api/reference/custom/options"));
  } finally {
    globalThis.fetch = prevFetch;
    globalThis.window = prevWindow;
  }
});

test("apiGetReferenceOptions: returns error for empty source", async () => {
  const out = await apiGetReferenceOptions("  ");
  assert.equal(out.ok, false);
  assert.equal(out.error, "missing source");
});
