// Unit/contract-тесты единого version-tracker preferences (срез F2
// fix/canvas-overlays-preferences-409, audit H1): гонка писателей → максимум
// один 409, LWW-ретрай со свежей версией, auth-retry PATCH с актуальной
// base_version. Паттерн — node:test, как у explorerTreePersistence.test.mjs.

import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPLORER_TREE_EXPANDED_KEY,
  adoptPreferencesSnapshot,
  createExplorerTreeSaver,
  getLatestKnownPreferencesVersion,
  patchUserPreferencesWithLww,
  registerPreferencesVersionSaver,
  setPreferencesQueryCacheBridge,
  patchUserPreferences,
  __resetPreferencesVersionTrackerForTests,
} from "./explorerTreePersistence.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** In-memory CAS-сервер preferences: base_version !== current → 409+снапшот. */
function makeCasServer(initialVersion = 10, initialPreferences = {}) {
  const state = {
    version: initialVersion,
    preferences: { ...initialPreferences },
    conflicts: 0,
    requests: [],
  };
  const patch = async ({ baseVersion, set, unset }) => {
    state.requests.push({ baseVersion, set, unset });
    if (Number(baseVersion) !== state.version) {
      state.conflicts += 1;
      return {
        ok: false,
        status: 409,
        data: { user_id: "u1", version: state.version, preferences: { ...state.preferences } },
      };
    }
    state.version += 1;
    Object.assign(state.preferences, set || {});
    for (const key of unset || []) delete state.preferences[key];
    return {
      ok: true,
      status: 200,
      data: { user_id: "u1", version: state.version, preferences: { ...state.preferences } },
    };
  };
  return { state, patch };
}

test("adoptPreferencesSnapshot синхронизирует ОБА трекера: saver.syncVersion + query cache bridge", () => {
  __resetPreferencesVersionTrackerForTests();
  const synced = [];
  const bridged = [];
  registerPreferencesVersionSaver({ syncVersion: (v) => synced.push(v) });
  setPreferencesQueryCacheBridge((doc) => bridged.push(doc));

  const doc = { user_id: "u1", version: 7, preferences: { a: 1 } };
  adoptPreferencesSnapshot(doc);

  assert.equal(getLatestKnownPreferencesVersion(), 7);
  assert.deepEqual(synced, [7], "treeSaver-версия синхронизирована");
  assert.deepEqual(bridged, [doc], "query cache синхронизирован");
});

test("adoptPreferencesSnapshot игнорирует битые снапшоты и не дёргает трекеры", () => {
  __resetPreferencesVersionTrackerForTests();
  const synced = [];
  const bridged = [];
  registerPreferencesVersionSaver({ syncVersion: (v) => synced.push(v) });
  setPreferencesQueryCacheBridge((doc) => bridged.push(doc));
  adoptPreferencesSnapshot({ version: 4, preferences: {} });

  adoptPreferencesSnapshot(null);
  adoptPreferencesSnapshot({});
  adoptPreferencesSnapshot({ version: "nope" });

  assert.equal(getLatestKnownPreferencesVersion(), 4);
  assert.deepEqual(synced, [4]);
  assert.equal(bridged.length, 1);
});

test("treeSaver: успешный flush синхронизирует query cache и saver-версию (bridge получает doc)", async () => {
  __resetPreferencesVersionTrackerForTests();
  const server = makeCasServer(20);
  const bridged = [];
  setPreferencesQueryCacheBridge((doc) => bridged.push(doc));
  const saver = createExplorerTreeSaver({ patchFn: server.patch, debounceMs: 1 });
  registerPreferencesVersionSaver(saver);

  saver.attach({ version: 20, preferences: { [EXPLORER_TREE_EXPANDED_KEY]: { "org::ws": ["f1"] } } });
  saver.schedule("ws", ["f1", "f2"], "org");
  await sleep(30);

  assert.equal(server.state.version, 21);
  assert.equal(saver.getVersion(), 21);
  assert.equal(getLatestKnownPreferencesVersion(), 21);
  assert.equal(server.state.conflicts, 0);
  const lastBridge = bridged[bridged.length - 1];
  assert.equal(lastBridge?.version, 21, "query cache получил свежий документ после flush");
});

test("treeSaver: 409 → LWW-ретрай с версией снапшота, ровно один 409 на писателя", async () => {
  __resetPreferencesVersionTrackerForTests();
  const server = makeCasServer(30);
  const saver = createExplorerTreeSaver({ patchFn: server.patch, debounceMs: 1 });
  registerPreferencesVersionSaver(saver);

  saver.attach({ version: 30, preferences: {} });
  saver.schedule("ws", ["f1"], "org");
  await sleep(30);
  assert.equal(server.state.version, 31);

  // Параллельный писатель поднял версию на сервере (его adopt уходит в трекер).
  const other = await server.patch({ baseVersion: 31, set: { other_key: 1 } });
  adoptPreferencesSnapshot(other.data);

  // treeSaver к этому моменту тоже синхронизирован через adopt → flush без 409.
  saver.schedule("ws", ["f1", "f3"], "org");
  await sleep(30);

  assert.equal(server.state.conflicts, 0, "после adopt чужого снапшота flush не получает 409");
  assert.equal(server.state.version, 33, "30 → flush 31 → чужой 32 → flush 33");
  assert.deepEqual(server.state.preferences[EXPLORER_TREE_EXPANDED_KEY]["org::ws"], ["f1", "f3"]);
});

test("гонка двух писателей → суммарно не более одного 409, обе правки в финальном документе", async () => {
  __resetPreferencesVersionTrackerForTests();
  const server = makeCasServer(40);
  setPreferencesQueryCacheBridge(() => {});
  const saver = createExplorerTreeSaver({ patchFn: server.patch, debounceMs: 1 });
  registerPreferencesVersionSaver(saver);

  const initial = { version: 40, preferences: { [EXPLORER_TREE_EXPANDED_KEY]: {} } };
  adoptPreferencesSnapshot(initial);
  saver.attach(initial);

  // Детерминированная гонка: B стартует первым и вычисляет base 40, но его
  // запрос уходит на сервер только после flush A (200 v41 + adopt в трекер) →
  // ровно один 409 у B и LWW-ретрай со свежей версией.
  let releaseB;
  const gate = new Promise((r) => { releaseB = r; });
  const bPatch = async (args) => {
    await gate;
    return server.patch(args);
  };
  saver.schedule("ws", ["fA"], "org");
  const bPromise = patchUserPreferencesWithLww({
    set: { banner_key: "1" },
    patchFn: bPatch,
  });
  await sleep(30); // A flush завершился (200 v41, adopt в трекер)
  releaseB();
  const b = await bPromise;

  assert.equal(b.ok, true, "писатель B дошёл до успеха через LWW-ретрай");
  assert.ok(b.attempts <= 2, `писатель B исчерпал ретраи (attempts=${b.attempts})`);
  assert.equal(server.state.conflicts, 1, "максимум один 409 на гонку");
  assert.deepEqual(server.state.preferences[EXPLORER_TREE_EXPANDED_KEY]["org::ws"], ["fA"]);
  assert.equal(server.state.preferences.banner_key, "1");
  assert.equal(getLatestKnownPreferencesVersion(), server.state.version);
});

test("patchUserPreferencesWithLww: не-CAS ошибка не ретраится", async () => {
  __resetPreferencesVersionTrackerForTests();
  adoptPreferencesSnapshot({ version: 50, preferences: {} });
  let calls = 0;
  const patchFn = async () => {
    calls += 1;
    return { ok: false, status: 500, error: "boom" };
  };
  const out = await patchUserPreferencesWithLww({ set: { k: 1 }, patchFn });
  assert.equal(out.ok, false);
  assert.equal(out.status, 500);
  assert.equal(calls, 1, "500 не ретраится");
});

test("patchUserPreferencesWithLww: версия неизвестна (гость) → использует переданный baseVersion", async () => {
  __resetPreferencesVersionTrackerForTests();
  const seen = [];
  const patchFn = async ({ baseVersion, set }) => {
    seen.push(baseVersion);
    return { ok: true, status: 200, data: { version: Number(baseVersion) + 1, preferences: { ...set } } };
  };
  const out = await patchUserPreferencesWithLww({ baseVersion: 77, set: { k: 1 }, patchFn });
  assert.equal(out.ok, true);
  assert.deepEqual(seen, [77]);
  assert.equal(getLatestKnownPreferencesVersion(), 78, "успех adopt'ится в трекер");
});

function createStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(String(key), String(value)); },
    removeItem(key) { store.delete(String(key)); },
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("patchUserPreferences: auth-retry перечитывает base_version из последнего известного снапшота", async () => {
  __resetPreferencesVersionTrackerForTests();
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  global.window = {
    location: { href: "http://local/app", pathname: "/app", search: "", hash: "" },
    localStorage,
    sessionStorage,
  };
  localStorage.setItem("fpc_active_org_id", "org_a");

  // Трекер уже знает версию 12 (409-снапшот от параллельного писателя), а PATCH
  // стартовал со stale base_version=10 → 401 → refresh → retry обязан уйти с 12.
  adoptPreferencesSnapshot({ version: 12, preferences: { remote_key: 1 } });

  const patchBodies = [];
  global.fetch = async (url, init) => {
    const u = String(url || "");
    if (u.includes("/api/auth/refresh")) {
      return jsonResponse({ access_token: "token_new", token_type: "bearer" });
    }
    if (u.includes("/api/users/me/preferences") && String(init?.method || "").toUpperCase() === "PATCH") {
      patchBodies.push(String(init.body || ""));
      const auth = String(new Headers(init?.headers).get("authorization") || "");
      if (auth === "Bearer token_old") return jsonResponse({ detail: "missing_bearer" }, 401);
      return jsonResponse({ version: 13, preferences: { remote_key: 1, ours: 1 } }, 200);
    }
    return jsonResponse({}, 200);
  };

  const apiCore = await import("../../lib/apiCore.js");
  apiCore.setActiveOrgId("org_a", { persist: false });
  apiCore.setAccessToken("token_old", { persist: false });

  const resp = await patchUserPreferences({ baseVersion: 10, set: { ours: 1 } });

  assert.equal(resp.ok, true);
  assert.equal(patchBodies.length, 2, "оригинал + retry после refresh");
  assert.equal(JSON.parse(patchBodies[0]).base_version, 10, "оригинал — исходная версия");
  assert.equal(JSON.parse(patchBodies[1]).base_version, 12, "retry — актуальная версия из трекера");
  assert.equal(getLatestKnownPreferencesVersion(), 13, "успешный ответ adopt'ится");
});
