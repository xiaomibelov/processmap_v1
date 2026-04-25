import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetTelemetryForTests,
  getRuntimeId,
  getTelemetryDebugState,
  installGlobalFrontendTelemetry,
  sendTelemetryEvent,
} from "./telemetryClient.js";

function createStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(String(key), String(value)); },
    removeItem(key) { store.delete(String(key)); },
  };
}

function createWindowMock(url = "http://local/app?project=proj_1&session=sess_1") {
  const parsed = new URL(url);
  const listeners = new Map();
  return {
    location: {
      href: parsed.href,
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
    },
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    addEventListener(type, listener) {
      const key = String(type || "");
      const current = listeners.get(key) || [];
      current.push(listener);
      listeners.set(key, current);
    },
    __dispatch(type, event = {}) {
      for (const listener of listeners.get(String(type || "")) || []) listener(event);
    },
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

test("sendTelemetryEvent attaches runtime/tab/route context and redacts sensitive fields", async () => {
  __resetTelemetryForTests();
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  localStorage.setItem("fpc_auth_access_token", "token_123");
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

  let call = null;
  global.fetch = async (url, init) => {
    call = { url, init };
    return new Response(JSON.stringify({ ok: true, item: { id: "evt_1" } }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };

  const out = await sendTelemetryEvent({
    source: "frontend",
    event_type: "frontend_nonfatal",
    severity: "warn",
    message: "small issue",
    context_json: {
      headers: { authorization: "Bearer secret", cookie: "secret", "x-safe": "ok" },
      bpmn_xml: "<xml/>",
      payload: { should: "hide" },
    },
  }, { bypassThrottle: true });

  assert.equal(out.ok, true);
  assert.ok(call);
  assert.equal(call.init.headers.Authorization, "Bearer token_123");
  assert.equal(call.init.headers["X-Org-Id"], "org_alpha");
  const body = JSON.parse(call.init.body);
  assert.equal(body.route, "/app?project=proj_1&session=sess_1");
  assert.equal(body.project_id, "proj_1");
  assert.equal(body.session_id, "sess_1");
  assert.equal(body.runtime_id, getRuntimeId());
  assert.ok(body.tab_id);
  assert.equal(body.context_json.headers.authorization, "[REDACTED]");
  assert.equal(body.context_json.headers.cookie, "[REDACTED]");
  assert.equal(body.context_json.headers["x-safe"], "ok");
  assert.equal(body.context_json.bpmn_xml._redacted, "bpmn_xml");
  assert.equal(body.context_json.payload._redacted, "payload");
});

test("sendTelemetryEvent throttles repeated same fingerprint in a short window", async () => {
  __resetTelemetryForTests();
  global.window = {
    location: { href: "http://local/", pathname: "/", search: "", hash: "" },
    localStorage: createStorage(),
    sessionStorage: createStorage(),
  };
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };

  const first = await sendTelemetryEvent({
    source: "frontend",
    event_type: "frontend_nonfatal",
    severity: "error",
    message: "dup-message",
  });
  const second = await sendTelemetryEvent({
    source: "frontend",
    event_type: "frontend_nonfatal",
    severity: "error",
    message: "dup-message",
  });

  assert.equal(first.ok, true);
  assert.equal(second.skipped, "throttled");
  assert.equal(calls, 1);
});

test("installGlobalFrontendTelemetry emits frontend_fatal for window error events", async () => {
  __resetTelemetryForTests();
  global.window = createWindowMock();
  global.fetch = async () => new Response(JSON.stringify({ ok: true }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });

  installGlobalFrontendTelemetry();
  global.window.__dispatch("error", {
    message: "runtime boom",
    error: new Error("runtime boom"),
    filename: "app.js",
    lineno: 12,
    colno: 34,
  });

  await waitFor(() => getTelemetryDebugState().accepted.length === 1);
  const payload = getTelemetryDebugState().accepted[0]?.payload || {};
  assert.equal(payload.event_type, "frontend_fatal");
  assert.equal(payload.severity, "fatal");
  assert.equal(payload.message, "runtime boom");
  assert.equal(payload.context_json.filename, "app.js");
});

test("installGlobalFrontendTelemetry emits frontend_unhandled_rejection for promise rejection events", async () => {
  __resetTelemetryForTests();
  global.window = createWindowMock();
  global.fetch = async () => new Response(JSON.stringify({ ok: true }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });

  installGlobalFrontendTelemetry();
  global.window.__dispatch("unhandledrejection", {
    reason: new Error("promise boom"),
  });

  await waitFor(() => getTelemetryDebugState().accepted.length === 1);
  const payload = getTelemetryDebugState().accepted[0]?.payload || {};
  assert.equal(payload.event_type, "frontend_unhandled_rejection");
  assert.equal(payload.severity, "error");
  assert.equal(payload.message, "promise boom");
  assert.equal(payload.context_json.name, "Error");
});
