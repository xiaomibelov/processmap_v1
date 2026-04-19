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

test("apiRequest suppresses telemetry api_failure for cancel-race on versions bootstrap head", async () => {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  localStorage.setItem("fpc_active_org_id", "org_alpha");
  global.window = {
    location: {
      href: "http://local/app?project=proj_1&session=sess_boot",
      pathname: "/app",
      search: "?project=proj_1&session=sess_boot",
      hash: "",
    },
    localStorage,
    sessionStorage,
  };

  const fetchCalls = [];
  global.fetch = async (url, init) => {
    const text = String(url || "");
    fetchCalls.push({ url: text, init });
    if (text.includes("/api/sessions/sess_boot/bpmn/versions?limit=1")) {
      throw new TypeError("Failed to fetch");
    }
    if (text.includes("/api/telemetry/error-events")) {
      return new Response(JSON.stringify({ ok: true, item: { id: "evt_noise_should_not_exist" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const telemetry = await import("../features/telemetry/telemetryClient.js");
  telemetry.__resetTelemetryForTests();
  const apiCore = await import("./apiCore.js");

  const out = await apiCore.apiRequest("/api/sessions/sess_boot/bpmn/versions?limit=1", {
    method: "GET",
    auth: false,
    retryAuth: false,
  });

  assert.equal(out.ok, false);
  assert.equal(out.status, 0);
  assert.equal(out.error_name, "TypeError");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(telemetry.getTelemetryDebugState().accepted.length, 0);
  assert.equal(fetchCalls.filter((item) => item.url.includes("/api/telemetry/error-events")).length, 0);
});

test("apiRequest still emits telemetry api_failure for real versions endpoint failure", async () => {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  localStorage.setItem("fpc_active_org_id", "org_alpha");
  global.window = {
    location: {
      href: "http://local/app?project=proj_1&session=sess_500",
      pathname: "/app",
      search: "?project=proj_1&session=sess_500",
      hash: "",
    },
    localStorage,
    sessionStorage,
  };

  const fetchCalls = [];
  global.fetch = async (url, init) => {
    const text = String(url || "");
    fetchCalls.push({ url: text, init });
    if (text.includes("/api/telemetry/error-events")) {
      return new Response(JSON.stringify({ ok: true, item: { id: "evt_api_500" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ detail: "server exploded" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  };

  const telemetry = await import("../features/telemetry/telemetryClient.js");
  telemetry.__resetTelemetryForTests();
  const apiCore = await import("./apiCore.js");

  const out = await apiCore.apiRequest("/api/sessions/sess_500/bpmn/versions?limit=1", {
    method: "GET",
    auth: false,
    retryAuth: false,
  });

  assert.equal(out.ok, false);
  assert.equal(out.status, 500);
  await waitFor(() => telemetry.getTelemetryDebugState().accepted.length === 1);
  const payload = telemetry.getTelemetryDebugState().accepted[0]?.payload || {};
  assert.equal(payload.event_type, "api_failure");
  assert.equal(payload.context_json.endpoint, "/api/sessions/sess_500/bpmn/versions?limit=1");
  assert.equal(payload.context_json.status, 500);
  assert.equal(fetchCalls.filter((item) => item.url.includes("/api/telemetry/error-events")).length, 1);
});

test("apiRequest suppresses telemetry api_failure for cancel-race on project sessions bootstrap", async () => {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  localStorage.setItem("fpc_active_org_id", "org_alpha");
  global.window = {
    location: {
      href: "http://local/app?project=proj_1&session=sess_boot_projects",
      pathname: "/app",
      search: "?project=proj_1&session=sess_boot_projects",
      hash: "",
    },
    localStorage,
    sessionStorage,
  };

  const fetchCalls = [];
  global.fetch = async (url, init) => {
    const text = String(url || "");
    fetchCalls.push({ url: text, init });
    if (text.includes("/api/projects/proj_1/sessions")) {
      throw new TypeError("Failed to fetch");
    }
    if (text.includes("/api/telemetry/error-events")) {
      return new Response(JSON.stringify({ ok: true, item: { id: "evt_sessions_noise_should_not_exist" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const telemetry = await import("../features/telemetry/telemetryClient.js");
  telemetry.__resetTelemetryForTests();
  const apiCore = await import("./apiCore.js");

  const out = await apiCore.apiRequest("/api/projects/proj_1/sessions", {
    method: "GET",
    auth: false,
    retryAuth: false,
  });

  assert.equal(out.ok, false);
  assert.equal(out.status, 0);
  assert.equal(out.error_name, "TypeError");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(telemetry.getTelemetryDebugState().accepted.length, 0);
  assert.equal(fetchCalls.filter((item) => item.url.includes("/api/telemetry/error-events")).length, 0);
});

test("apiRequest suppresses telemetry api_failure for cancel-race on project explorer bootstrap", async () => {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  localStorage.setItem("fpc_active_org_id", "org_alpha");
  global.window = {
    location: {
      href: "http://local/app?project=proj_1&session=sess_boot_explorer",
      pathname: "/app",
      search: "?project=proj_1&session=sess_boot_explorer",
      hash: "",
    },
    localStorage,
    sessionStorage,
  };

  const fetchCalls = [];
  global.fetch = async (url, init) => {
    const text = String(url || "");
    fetchCalls.push({ url: text, init });
    if (text.includes("/api/projects/proj_1/explorer?workspace_id=ws_1")) {
      throw new TypeError("Failed to fetch");
    }
    if (text.includes("/api/telemetry/error-events")) {
      return new Response(JSON.stringify({ ok: true, item: { id: "evt_explorer_noise_should_not_exist" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const telemetry = await import("../features/telemetry/telemetryClient.js");
  telemetry.__resetTelemetryForTests();
  const apiCore = await import("./apiCore.js");

  const out = await apiCore.apiRequest("/api/projects/proj_1/explorer?workspace_id=ws_1", {
    method: "GET",
    auth: false,
    retryAuth: false,
  });

  assert.equal(out.ok, false);
  assert.equal(out.status, 0);
  assert.equal(out.error_name, "TypeError");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(telemetry.getTelemetryDebugState().accepted.length, 0);
  assert.equal(fetchCalls.filter((item) => item.url.includes("/api/telemetry/error-events")).length, 0);
});

test("apiRequest still emits telemetry api_failure for real project bootstrap endpoint failure", async () => {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  localStorage.setItem("fpc_active_org_id", "org_alpha");
  global.window = {
    location: {
      href: "http://local/app?project=proj_1&session=sess_503",
      pathname: "/app",
      search: "?project=proj_1&session=sess_503",
      hash: "",
    },
    localStorage,
    sessionStorage,
  };

  const fetchCalls = [];
  global.fetch = async (url, init) => {
    const text = String(url || "");
    fetchCalls.push({ url: text, init });
    if (text.includes("/api/telemetry/error-events")) {
      return new Response(JSON.stringify({ ok: true, item: { id: "evt_project_503" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ detail: "upstream unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  };

  const telemetry = await import("../features/telemetry/telemetryClient.js");
  telemetry.__resetTelemetryForTests();
  const apiCore = await import("./apiCore.js");

  const out = await apiCore.apiRequest("/api/projects/proj_1/sessions", {
    method: "GET",
    auth: false,
    retryAuth: false,
  });

  assert.equal(out.ok, false);
  assert.equal(out.status, 503);
  await waitFor(() => telemetry.getTelemetryDebugState().accepted.length === 1);
  const payload = telemetry.getTelemetryDebugState().accepted[0]?.payload || {};
  assert.equal(payload.event_type, "api_failure");
  assert.equal(payload.context_json.endpoint, "/api/projects/proj_1/sessions");
  assert.equal(payload.context_json.status, 503);
  assert.equal(fetchCalls.filter((item) => item.url.includes("/api/telemetry/error-events")).length, 1);
});
