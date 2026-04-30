import test from "node:test";
import assert from "node:assert/strict";

import { apiCreateProjectSession, apiListProjectSessions } from "./api.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("apiListProjectSessions uses lightweight summary view by default", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return jsonResponse([{ id: "sess_1", title: "Summary session" }]);
    };

    const out = await apiListProjectSessions("proj_1");

    assert.equal(out.ok, true);
    assert.equal(out.sessions.length, 1);
    const url = new URL(calls[0].url, "http://local");
    assert.equal(url.pathname, "/api/projects/proj_1/sessions");
    assert.equal(url.searchParams.get("view"), "summary");
    assert.equal(url.searchParams.has("mode"), false);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiListProjectSessions preserves explicit mode and view override", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return jsonResponse([]);
    };

    const out = await apiListProjectSessions("proj_1", "quick_skeleton", { view: "full" });

    assert.equal(out.ok, true);
    const url = new URL(calls[0].url, "http://local");
    assert.equal(url.pathname, "/api/projects/proj_1/sessions");
    assert.equal(url.searchParams.get("mode"), "quick_skeleton");
    assert.equal(url.searchParams.get("view"), "full");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiCreateProjectSession does not force summary view on create", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return jsonResponse({ id: "sess_2", title: "Created" });
    };

    const out = await apiCreateProjectSession("proj_1", "quick_skeleton", "Created");

    assert.equal(out.ok, true);
    assert.equal(out.session_id, "sess_2");
    const url = new URL(calls[0].url, "http://local");
    assert.equal(url.pathname, "/api/projects/proj_1/sessions");
    assert.equal(url.searchParams.get("mode"), "quick_skeleton");
    assert.equal(url.searchParams.has("view"), false);
  } finally {
    globalThis.fetch = prevFetch;
  }
});
