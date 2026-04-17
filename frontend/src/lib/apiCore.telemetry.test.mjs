import test from "node:test";
import assert from "node:assert/strict";

function createStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(String(key), String(value)); },
    removeItem(key) { store.delete(String(key)); },
  };
}

async function waitFor(check, timeoutMs = 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("wait_for_timeout");
}

test("apiRequest emits one api_failure telemetry event for final failed request", async () => {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  localStorage.setItem("fpc_active_org_id", "org_alpha");
  global.window = {
    location: {
      href: "http://local/app?project=proj_1&session=sess_1",
      pathname: "/app",
      search: "?project=proj_1&session=sess_1",
      hash: "",
    },
    localStorage,
    sessionStorage,
  };

  const fetchCalls = [];
  global.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    if (String(url).includes("/api/telemetry/error-events")) {
      return new Response(JSON.stringify({ ok: true, item: { id: "evt_api_1" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ detail: "missing" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  };

  const telemetry = await import("../features/telemetry/telemetryClient.js");
  telemetry.__resetTelemetryForTests();
  const apiCore = await import("./apiCore.js");

  const out = await apiCore.apiRequest("/api/telemetry-proof/missing", {
    method: "GET",
    auth: false,
    retryAuth: false,
  });

  assert.equal(out.ok, false);
  assert.equal(out.status, 404);
  await waitFor(() => telemetry.getTelemetryDebugState().accepted.length === 1);
  const debug = telemetry.getTelemetryDebugState();
  assert.equal(debug.accepted.length, 1);
  const accepted = debug.accepted[0] || {};
  const payload = accepted.payload || {};
  assert.equal(payload.event_type, "api_failure");
  assert.equal(payload.context_json.endpoint, "/api/telemetry-proof/missing");
  assert.equal(payload.context_json.status, 404);
  assert.equal(payload.project_id, "proj_1");
  assert.equal(payload.session_id, "sess_1");
  assert.ok(payload.request_id);
  assert.equal(fetchCalls.length, 2);
});

test("okOrError emits api_failure for 200 responses carrying error payloads", async () => {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  localStorage.setItem("fpc_active_org_id", "org_alpha");
  global.window = {
    location: {
      href: "http://local/app?project=proj_1&session=sess_404",
      pathname: "/app",
      search: "?project=proj_1&session=sess_404",
      hash: "",
    },
    localStorage,
    sessionStorage,
  };

  const fetchCalls = [];
  global.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    if (String(url).includes("/api/telemetry/error-events")) {
      return new Response(JSON.stringify({ ok: true, item: { id: "evt_api_200_error" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const telemetry = await import("../features/telemetry/telemetryClient.js");
  telemetry.__resetTelemetryForTests();
  const apiCore = await import("./apiCore.js");

  const raw = await apiCore.apiRequest("/api/sessions/sess_404", {
    method: "GET",
    auth: false,
    retryAuth: false,
  });
  const out = apiCore.okOrError(raw);

  assert.equal(out.ok, false);
  assert.equal(out.status, 404);
  assert.equal(out.error, "not found");
  assert.ok(out.request_id);
  await waitFor(() => telemetry.getTelemetryDebugState().accepted.length === 1);
  const payload = telemetry.getTelemetryDebugState().accepted[0]?.payload || {};
  assert.equal(payload.event_type, "api_failure");
  assert.equal(payload.context_json.endpoint, "/api/sessions/sess_404");
  assert.equal(payload.context_json.status, 404);
  assert.equal(payload.context_json.error_name, "ok_error_payload");
  assert.equal(payload.session_id, "sess_404");
  assert.equal(payload.request_id, out.request_id);
  assert.equal(fetchCalls.length, 2);
});
