// Characterization/contract-тесты auth-retry apiCore (срез F2
// fix/canvas-overlays-preferences-409, audit H1).
//
// Зачем: apiCore меняется минимально (opt-in onBeforeAuthRetry hook), и эти
// тесты фиксируют, что ДЕФОЛТНОЕ поведение 401 → refresh → retry НЕ изменилось
// ни в одном сценарии — в первую очередь для save-пайплайна (operations/
// delta-save, createSaveOutbox и пр. вызовы apiCore БЕЗ hook):
//   - retry шлёт ТО ЖЕ тело и ТОТ ЖЕ метод (base_version не перечитывается),
//   - __didRetryAuth — одинарный ретрай (второй 401 не ретраится),
//   - refresh — single-flight (конкурентные 401 ждут одного in-flight),
//   - blocklist / retryAuth:false прежние.
// Hook-сценарии: opt-in, одинарный вызов, подмена body, ошибка hook не ломает retry.

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

function setupBrowser() {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  global.window = {
    location: {
      href: "http://local/app",
      pathname: "/app",
      search: "",
      hash: "",
    },
    localStorage,
    sessionStorage,
  };
  return { localStorage, sessionStorage };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** fetch-роутер: handler(call, index) → Response. Возвращает журнал вызовов. */
function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, init) => {
    const headers = new Headers(init?.headers || {});
    const call = {
      url: String(url || ""),
      method: String(init?.method || "GET").toUpperCase(),
      headers,
      body: typeof init?.body === "string" ? init.body : "",
      authorization: headers.get("authorization") || "",
    };
    calls.push(call);
    return handler(call, calls.length);
  };
  return calls;
}

const isRefresh = (call) => call.url.includes("/api/auth/refresh") && call.method === "POST";

/** Стандартный сценарий: 401 на первый вызов target, refresh ок, retry ок. */
function authRetryHandler({ targetPath, okPayload = { ok: true }, attempts = new Map() }) {
  return (call) => {
    if (isRefresh(call)) {
      return jsonResponse({ access_token: "token_new", token_type: "bearer" });
    }
    if (call.url.includes(targetPath)) {
      const seen = attempts.get(call.method + call.url) || 0;
      attempts.set(call.method + call.url, seen + 1);
      if (seen === 0 && call.authorization === "Bearer token_old") {
        return jsonResponse({ detail: "missing_bearer" }, 401);
      }
      return jsonResponse(okPayload, 200);
    }
    return jsonResponse({ ok: true }, 200);
  };
}

async function freshApiCore(localStorage) {
  const telemetry = await import("../features/telemetry/telemetryClient.js");
  telemetry.__resetTelemetryForTests();
  const apiCore = await import("./apiCore.js");
  localStorage.setItem("fpc_active_org_id", "org_a");
  apiCore.setActiveOrgId("org_a", { persist: false });
  apiCore.setAccessToken("token_old", { persist: false });
  return apiCore;
}

const OPS_PATH = "/api/sessions/sess_char_1/operations";

test("characterization: save-пайплайн (operations POST) — 401 → refresh → retry с ТЕМ ЖЕ телом и методом", async () => {
  const { localStorage } = setupBrowser();
  const body = {
    base_diagram_state_version: 7,
    operations: [{ op: "shape.move", element_id: "Task_1", delta: { x: 10, y: 0 } }],
  };
  const calls = mockFetch(authRetryHandler({ targetPath: OPS_PATH }));
  const apiCore = await freshApiCore(localStorage);

  const out = await apiCore.apiRequest(OPS_PATH, { method: "POST", body });

  assert.equal(out.ok, true, "retry после refresh должен завершиться 200");
  assert.equal(out.status, 200);
  const opsCalls = calls.filter((c) => c.url.includes(OPS_PATH));
  assert.equal(opsCalls.length, 2, "ровно два вызова: оригинал + retry");
  assert.equal(opsCalls[0].method, "POST");
  assert.equal(opsCalls[1].method, "POST", "метод retry не меняется");
  assert.equal(opsCalls[1].body, opsCalls[0].body, "retry шлёт байт-в-байт прежнее тело (base_version не перечитывается)");
  assert.deepEqual(JSON.parse(opsCalls[1].body), body);
  assert.equal(opsCalls[0].authorization, "Bearer token_old");
  assert.equal(opsCalls[1].authorization, "Bearer token_new", "retry идёт с новым access token");
  assert.equal(opsCalls[1].headers.get("content-type"), "application/json");
  assert.equal(calls.filter(isRefresh).length, 1, "refresh вызван один раз");
});

test("characterization: PATCH preferences БЕЗ hook — retry со stale base_version (тело прежнее)", async () => {
  const { localStorage } = setupBrowser();
  const body = { base_version: 3, set: { "explorer.status_filters.hidden": { ws1: ["draft"] } }, unset: [] };
  const calls = mockFetch(authRetryHandler({ targetPath: "/api/users/me/preferences" }));
  const apiCore = await freshApiCore(localStorage);

  const out = await apiCore.apiRequest("/api/users/me/preferences", { method: "PATCH", body });

  assert.equal(out.ok, true);
  const patches = calls.filter((c) => c.url.includes("/api/users/me/preferences") && c.method === "PATCH");
  assert.equal(patches.length, 2);
  assert.equal(patches[1].body, patches[0].body, "без hook тело не меняется — stale base_version уходит в retry");
  assert.equal(JSON.parse(patches[1].body).base_version, 3);
  assert.equal(calls.filter(isRefresh).length, 1);
});

test("characterization: __didRetryAuth одинарный — второй 401 подряд НЕ ретраится", async () => {
  const { localStorage } = setupBrowser();
  const calls = mockFetch((call) => {
    if (isRefresh(call)) return jsonResponse({ access_token: "token_new", token_type: "bearer" });
    if (call.url.includes("/api/sessions/sess_char_2/bpmn")) {
      return jsonResponse({ detail: "missing_bearer" }, 401);
    }
    return jsonResponse({}, 200);
  });
  const apiCore = await freshApiCore(localStorage);

  const out = await apiCore.apiRequest("/api/sessions/sess_char_2/bpmn", { method: "GET" });

  assert.equal(out.ok, false);
  assert.equal(out.status, 401);
  const gets = calls.filter((c) => c.url.includes("/api/sessions/sess_char_2/bpmn") && c.method === "GET");
  assert.equal(gets.length, 2, "два вызова: оригинал + один retry, дальше — финальный 401");
  assert.equal(calls.filter(isRefresh).length, 1, "refresh тоже один (authAttempts >= 1 → abort)");
});

test("characterization: refresh single-flight — два конкурентных 401 → один refresh POST", async () => {
  const { localStorage } = setupBrowser();
  let refreshCalls = 0;
  const calls = mockFetch((call) => {
    if (isRefresh(call)) {
      refreshCalls += 1;
      return new Promise((resolve) => {
        setTimeout(() => resolve(jsonResponse({ access_token: "token_new", token_type: "bearer" })), 30);
      });
    }
    if (call.url.includes("/api/explorer")) {
      return call.authorization === "Bearer token_old"
        ? jsonResponse({ detail: "missing_bearer" }, 401)
        : jsonResponse({ items: [] }, 200);
    }
    return jsonResponse({}, 200);
  });
  const apiCore = await freshApiCore(localStorage);

  const [a, b] = await Promise.all([
    apiCore.apiRequest("/api/explorer?workspace_id=ws1", { method: "GET" }),
    apiCore.apiRequest("/api/explorer?workspace_id=ws1&folder_id=f1", { method: "GET" }),
  ]);

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(refreshCalls, 1, "конкурентные 401 ждут одного in-flight refresh");
  assert.equal(calls.filter((c) => c.url.includes("/api/explorer")).length, 4);
});

test("characterization: retryAuth:false и blocklist прежние — 401 без refresh", async () => {
  const { localStorage } = setupBrowser();
  const calls = mockFetch((call) => {
    if (call.url.includes("/api/auth/login")) return jsonResponse({ detail: "bad credentials" }, 401);
    if (call.url.includes("/api/users/me/preferences")) {
      return jsonResponse({ detail: "missing_bearer" }, 401);
    }
    return jsonResponse({}, 200);
  });
  const apiCore = await freshApiCore(localStorage);

  const blocked = await apiCore.apiRequest("/api/auth/login", {
    method: "POST",
    body: { email: "a@b.c", password: "x" },
    auth: false,
  });
  const noRetry = await apiCore.apiRequest("/api/users/me/preferences", { method: "GET", retryAuth: false });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 401);
  assert.equal(noRetry.ok, false);
  assert.equal(noRetry.status, 401);
  assert.equal(calls.filter(isRefresh).length, 0, "ни blocklist, ни retryAuth:false не инициируют refresh");
  assert.equal(calls.filter((c) => c.url.includes("/api/auth/login")).length, 1);
  assert.equal(calls.filter((c) => c.url.includes("/api/users/me/preferences")).length, 1);
});

test("hook onBeforeAuthRetry: opt-in — вызван один раз, подменяет body retry", async () => {
  const { localStorage } = setupBrowser();
  const calls = mockFetch(authRetryHandler({ targetPath: "/api/users/me/preferences" }));
  const apiCore = await freshApiCore(localStorage);

  const hookCalls = [];
  const out = await apiCore.apiRequest("/api/users/me/preferences", {
    method: "PATCH",
    body: { base_version: 3, set: { k: 1 }, unset: [] },
    onBeforeAuthRetry: (ctx) => {
      hookCalls.push(ctx);
      return { body: { base_version: 9, set: { k: 1 }, unset: [] } };
    },
  });

  assert.equal(out.ok, true);
  assert.equal(hookCalls.length, 1, "hook вызывается ровно один раз перед replay");
  assert.equal(hookCalls[0].method, "PATCH");
  assert.ok(String(hookCalls[0].path || "").includes("/api/users/me/preferences"));
  const patches = calls.filter((c) => c.url.includes("/api/users/me/preferences") && c.method === "PATCH");
  assert.equal(patches.length, 2);
  assert.equal(JSON.parse(patches[0].body).base_version, 3, "оригинальный запрос неизменен");
  assert.equal(JSON.parse(patches[1].body).base_version, 9, "replay идёт с подменённым телом");
  assert.equal(calls.filter(isRefresh).length, 1);
});

test("hook onBeforeAuthRetry: ошибка hook не ломает retry (дефолтное тело)", async () => {
  const { localStorage } = setupBrowser();
  const calls = mockFetch(authRetryHandler({ targetPath: "/api/users/me/preferences" }));
  const apiCore = await freshApiCore(localStorage);

  const out = await apiCore.apiRequest("/api/users/me/preferences", {
    method: "PATCH",
    body: { base_version: 3, set: { k: 1 }, unset: [] },
    onBeforeAuthRetry: () => {
      throw new Error("hook exploded");
    },
  });

  assert.equal(out.ok, true, "retry состоялся несмотря на ошибку hook");
  const patches = calls.filter((c) => c.url.includes("/api/users/me/preferences") && c.method === "PATCH");
  assert.equal(patches[1].body, patches[0].body, "при ошибке hook retry идёт с прежним телом");
});
