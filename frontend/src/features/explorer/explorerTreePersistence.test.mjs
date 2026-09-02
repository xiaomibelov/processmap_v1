import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPLORER_TREE_COLLAPSED_KEY,
  EXPLORER_TREE_EXPANDED_KEY,
  createExplorerTreeSaver,
  expandedIdsFromMap,
  expandedIdsFromPreferences,
  treeCollapsedWithExpandedIds,
  treeExpandedWithExpandedIds,
  treeScopeKey,
} from "./explorerTreePersistence.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("expandedIdsFromPreferences читает явно раскрытые ids по workspace", () => {
  const prefs = {
    [EXPLORER_TREE_EXPANDED_KEY]: { "org1::ws1": ["f1", "f3", "f1"], ws2: ["f9"] },
    [EXPLORER_TREE_COLLAPSED_KEY]: { ws1: ["legacy"] },
  };
  assert.deepEqual(expandedIdsFromPreferences(prefs, "ws1", "org1"), ["f1", "f3"]);
  assert.deepEqual(expandedIdsFromPreferences(prefs, "ws2"), ["f9"]);
  assert.deepEqual(expandedIdsFromPreferences(prefs, "ws_unknown"), []);
  assert.deepEqual(expandedIdsFromPreferences({}, "ws1"), []);
  assert.deepEqual(expandedIdsFromPreferences(null, "ws1"), []);
  assert.deepEqual(expandedIdsFromPreferences(prefs, ""), []);
});

test("expandedIdsFromPreferences falls back to legacy collapsed expanded-list", () => {
  const prefs = { [EXPLORER_TREE_COLLAPSED_KEY]: { "org1::ws1": ["f1"], ws1: ["legacy"] } };
  assert.deepEqual(expandedIdsFromPreferences(prefs, "ws1", "org1"), ["f1"]);
  assert.deepEqual(expandedIdsFromPreferences(prefs, "ws1", "org2"), ["legacy"]);
});

test("treeExpandedWithExpandedIds scopes by org/workspace and deletes empty lists", () => {
  const start = { "org1::ws1": ["f1"], "org2::ws1": ["f9"] };
  const next = treeExpandedWithExpandedIds(start, "ws1", ["f2", "f3"], "org1");
  assert.deepEqual(next, { "org1::ws1": ["f2", "f3"], "org2::ws1": ["f9"] });
  assert.deepEqual(start, { "org1::ws1": ["f1"], "org2::ws1": ["f9"] }, "исходный объект не мутируется");
  const cleared = treeExpandedWithExpandedIds(next, "ws1", [], "org1");
  assert.deepEqual(cleared, { "org2::ws1": ["f9"] });
  assert.equal(treeScopeKey("org1", "ws1"), "org1::ws1");
});

test("treeCollapsedWithExpandedIds keeps legacy two-argument compatibility", () => {
  const start = { ws1: ["f1"], ws2: ["f9"] };
  const next = treeCollapsedWithExpandedIds(start, "ws1", ["f2", "f3"]);
  assert.deepEqual(next, { ws1: ["f2", "f3"], ws2: ["f9"] });
  assert.deepEqual(start, { ws1: ["f1"], ws2: ["f9"] }, "исходный объект не мутируется");
  const cleared = treeCollapsedWithExpandedIds(next, "ws1", []);
  assert.deepEqual(cleared, { ws2: ["f9"] });
});

test("expandedIdsFromMap берёт только явные true", () => {
  assert.deepEqual(expandedIdsFromMap({ f1: true, f2: false, f3: true }), ["f1", "f3"]);
  assert.deepEqual(expandedIdsFromMap({}), []);
});

test("saver: debounce + base_version + инкремент версии из ответа", async () => {
  const calls = [];
  const saver = createExplorerTreeSaver({
    debounceMs: 5,
    patchFn: async ({ baseVersion, set }) => {
      calls.push({ baseVersion, set });
      return { ok: true, data: { version: baseVersion + 1, preferences: set } };
    },
  });
  saver.attach({ version: 7, preferences: { [EXPLORER_TREE_COLLAPSED_KEY]: { ws1: ["f0"] } } });
  saver.schedule("ws1", ["f0", "f1"], "org1");
  saver.schedule("ws1", ["f0"], "org1"); // свернули до срабатывания debounce — уйдёт последнее
  await sleep(30);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].baseVersion, 7);
  assert.deepEqual(calls[0].set[EXPLORER_TREE_EXPANDED_KEY], { "org1::ws1": ["f0"] });
  assert.equal(saver.getVersion(), 8);
});

test("saver: 409 → onSnapshot(серверный снапшот) + повтор с новой версией (LWW)", async () => {
  const calls = [];
  const snapshots = [];
  let version = 3;
  const saver = createExplorerTreeSaver({
    debounceMs: 5,
    onSnapshot: (doc) => snapshots.push(doc),
    patchFn: async ({ baseVersion, set }) => {
      calls.push({ baseVersion, set });
      if (baseVersion !== version) {
        return { ok: false, status: 409, data: { version, preferences: { [EXPLORER_TREE_COLLAPSED_KEY]: { ws1: ["server"] } } } };
      }
      version += 1;
      return { ok: true, data: { version, preferences: set } };
    },
  });
  saver.attach({ version: 2, preferences: {} }); // клиент отстал: на сервере уже v3
  saver.schedule("ws1", ["ours"], "org1");
  await sleep(60);
  assert.equal(calls.length, 2, "первый PATCH получил 409, затем повтор");
  assert.equal(calls[0].baseVersion, 2);
  assert.equal(calls[1].baseVersion, 3, "повтор с версией из тела 409");
  assert.deepEqual(calls[1].set[EXPLORER_TREE_EXPANDED_KEY], { "org1::ws1": ["ours"] }, "LWW: наше значение победило");
  assert.equal(snapshots.length, 2, "attach + 409-снапшот проброшены в UI");
  assert.equal(snapshots[1].preferences[EXPLORER_TREE_COLLAPSED_KEY].ws1[0], "server");
  assert.equal(saver.getVersion(), 4);
});

test("saver: без attach (GET не удался) сохранение отключено; сеть молча деградирует", async () => {
  let calls = 0;
  const saver = createExplorerTreeSaver({
    debounceMs: 5,
    patchFn: async () => { calls += 1; return { ok: false, status: 0, error: "network" }; },
  });
  assert.equal(saver.schedule("ws1", ["f1"]), false);
  await sleep(20);
  assert.equal(calls, 0);
  saver.attach({ version: 0, preferences: {} });
  saver.schedule("ws1", ["f1"], "org1");
  await sleep(30);
  assert.equal(calls, 1, "после attach PATCH уходит; сетевая ошибка проглатывается");
});
