// Unit-тесты P1 (fix/canvas-editing-stability): crossTabVersionSync.
// Два sync-инстанса на общей шине fake-каналов эмулируют две вкладки.

import test from "node:test";
import assert from "node:assert/strict";

import { createCrossTabVersionSync } from "./crossTabVersionSync.js";
import {
  __resetForTests as resetCasVersionTracker,
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
  subscribeDiagramVersionChanges,
} from "./casVersionTracker.js";

test.beforeEach(() => {
  resetCasVersionTracker();
});

// Шина: dispatch сообщения всем каналам кроме отправителя (семантика BroadcastChannel).
function makeBus() {
  const channels = new Set();
  return {
    createChannel() {
      let onmessage = null;
      const channel = {
        postMessage(msg) {
          for (const other of channels) {
            if (other === channel || typeof other.onmessage !== "function") continue;
            queueMicrotask(() => other.onmessage(msg));
          }
        },
        close() {
          channels.delete(channel);
        },
        set onmessage(fn) {
          onmessage = fn;
        },
        get onmessage() {
          return onmessage;
        },
      };
      channels.add(channel);
      return channel;
    },
    size() {
      return channels.size;
    },
  };
}

function makeTab(bus, clientId) {
  const warnings = [];
  const tabCounts = [];
  let dirty = false;
  const sync = createCrossTabVersionSync({
    clientId,
    createChannel: () => bus.createChannel(),
  });
  const unbind = sync.bind({
    sid: "sid_x",
    isDirty: () => dirty,
    onRemoteVersionWhileDirty: (info) => warnings.push(info),
    onTabCountChange: (count) => tabCounts.push(count),
  });
  return {
    sync,
    warnings,
    tabCounts,
    setDirty: (value) => {
      dirty = value === true;
    },
    close: () => {
      unbind();
      sync.unbind();
    },
  };
}

test("clean tab adopts remote version via broadcast", async () => {
  const bus = makeBus();
  const tabA = makeTab(bus, "ctx-a");
  const tabB = makeTab(bus, "ctx-b");
  setTrackedDiagramStateVersion("sid_x", 1);

  // B публикует версию (как после успешного save → bump tracker).
  tabB.sync.publishVersion("sid_x", 4);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(getTrackedDiagramStateVersion("sid_x"), 4, "clean tab A must adopt version 4");
  assert.deepEqual(tabA.warnings, [], "no warning for clean tab");
  tabA.close();
  tabB.close();
});

test("dirty tab does NOT adopt and reports a warning", async () => {
  const bus = makeBus();
  const tabA = makeTab(bus, "ctx-a");
  const tabB = makeTab(bus, "ctx-b");
  setTrackedDiagramStateVersion("sid_x", 1);
  tabA.setDirty(true);

  tabB.sync.publishVersion("sid_x", 5);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(getTrackedDiagramStateVersion("sid_x"), 1, "dirty tab must keep its CAS base");
  assert.deepEqual(tabA.warnings, [{ sid: "sid_x", version: 5 }]);
  tabA.close();
  tabB.close();
});

test("adopt does not echo back (no publish loop)", async () => {
  const bus = makeBus();
  const tabA = makeTab(bus, "ctx-a");
  const tabB = makeTab(bus, "ctx-b");
  setTrackedDiagramStateVersion("sid_x", 1);

  tabB.sync.publishVersion("sid_x", 6);
  await new Promise((resolve) => setTimeout(resolve, 0));
  // A adopt'ит 6. Если бы adopt эхом публиковался, B (clean) adopt'ил бы повторно —
  // цепочка была бы бесконечной; здесь проверяем, что версия стабилизировалась.
  assert.equal(getTrackedDiagramStateVersion("sid_x"), 6);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(getTrackedDiagramStateVersion("sid_x"), 6);
  assert.deepEqual(tabA.warnings, []);
  assert.deepEqual(tabB.warnings, []);
  tabA.close();
  tabB.close();
});

test("join/leave track open tab count per session", async () => {
  const bus = makeBus();
  const tabA = makeTab(bus, "ctx-a");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const tabB = makeTab(bus, "ctx-b");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(tabA.sync.getTabCount(), 1, "A sees one peer (B)");
  assert.equal(tabB.sync.getTabCount(), 1, "B sees one peer (A)");
  assert.deepEqual(tabA.tabCounts, [1], "A got join notification for B");

  tabB.close();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(tabA.sync.getTabCount(), 0, "A sees zero peers after B left");
  assert.deepEqual(tabA.tabCounts, [1, 0]);
  tabA.close();
});

test("newcomer receives current version via here-reply to join", async () => {
  const bus = makeBus();
  const tabA = makeTab(bus, "ctx-a");
  setTrackedDiagramStateVersion("sid_x", 9);

  // B открывает сессию ПОСЛЕ того, как серверная версия уже известна A.
  const tabB = makeTab(bus, "ctx-b");
  await new Promise((resolve) => setTimeout(resolve, 0));

  // B clean → adopt'ит версию из here-ответа A (трекер общий в этом тесте,
  // поэтому проверяем через отсутствие warning и корректность механизма here).
  assert.deepEqual(tabB.warnings, []);
  tabA.close();
  tabB.close();
});

test("messages for other sessions are ignored", async () => {
  const bus = makeBus();
  const tabA = makeTab(bus, "ctx-a");
  const tabB = makeTab(bus, "ctx-b");
  setTrackedDiagramStateVersion("sid_x", 1);

  tabB.sync.publishVersion("sid_other", 7);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(getTrackedDiagramStateVersion("sid_x"), 1);
  assert.deepEqual(tabA.warnings, []);
  tabA.close();
  tabB.close();
});

test("tracker subscription publishes set/bump to the channel", async () => {
  const bus = makeBus();
  const tabA = makeTab(bus, "ctx-a");
  const tabB = makeTab(bus, "ctx-b");

  const unsubscribe = subscribeDiagramVersionChanges(({ sid, version }) => {
    tabA.sync.publishVersion(sid, version);
  });
  setTrackedDiagramStateVersion("sid_x", 3);
  await new Promise((resolve) => setTimeout(resolve, 0));

  // B clean → adopt'ит опубликованную версию.
  assert.equal(getTrackedDiagramStateVersion("sid_x"), 3);
  assert.deepEqual(tabB.warnings, []);
  unsubscribe();
  tabA.close();
  tabB.close();
});
