import test from "node:test";
import assert from "node:assert/strict";

import { createSaveCoordinator } from "../../../../session/saveCoordinator.js";
import {
  setVersion as setTrackedDiagramStateVersion,
  __resetForTests as resetCasVersionTracker,
} from "../../../../../lib/casVersionTracker.js";
import { createOpsOutboxConfig } from "./opsOutboxConfig.js";
import {
  createSaveOutbox,
  installOpsOutboxNetworkTriggers,
} from "./createSaveOutbox.js";

// ---------------------------------------------------------------------------
// Контур feature/async-save-pipeline-step2 (UI.md §3, TESTS §1.6 partial —
// только триггер и состояние; рендеринг индикатора — следующий слайс).
//  - window online → немедленный flushNow({reason:"online"});
//  - window offline → flush suppressed (не штатная ошибка) + status-событие
//    ops-local/offline (индикатор читает его позже);
//  - navigator.onLine === false → flush не стартует.
// ---------------------------------------------------------------------------

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

function makeApi() {
  const calls = [];
  return {
    calls,
    postSessionOperations: async (sid, body, opts) => {
      calls.push({ sid, body, opts });
      return { ok: true, status: 200, version: 8, applied: body.operations.length, skipped: 0, diagramStateVersion: 8 };
    },
  };
}

function makeOutbox(t, options = {}) {
  const coordinator = options.coordinator || createSaveCoordinator();
  const api = options.api || makeApi();
  const statuses = [];
  const outbox = createSaveOutbox({
    sessionId: "s1",
    coordinator,
    api,
    uuid: (() => { let n = 0; return () => `op-${++n}`; })(),
    now: () => 1_000_000,
    jitterRandom: () => 0.5,
    requestFullSave: () => {},
    onStatus: (ev) => statuses.push(ev),
    navigator: options.navigator,
    journal: options.journal,
    syncStateStore: options.syncStateStore,
    config: createOpsOutboxConfig(options.configOverrides || {}),
  });
  return { coordinator, api, outbox, statuses, t };
}

function pushRename(outbox, id = "Task_1", name = "Имя") {
  return outbox.pushCommand({
    command: "element.updateProperties",
    action: "execute",
    context: { element: { id }, properties: { name } },
  });
}

function fakeWin() {
  const handlers = {};
  return {
    handlers,
    addEventListener: (name, cb) => { handlers[name] = cb; },
    removeEventListener: (name, cb) => { if (handlers[name] === cb) delete handlers[name]; },
  };
}

const drain = () => new Promise((resolve) => setImmediate(resolve));

test.beforeEach(() => {
  resetCasVersionTracker();
});

test("window online → immediate flushNow({reason:\"online\"})", async () => {
  const ctx = makeOutbox(null);
  const win = fakeWin();
  const uninstall = installOpsOutboxNetworkTriggers(ctx.outbox, { win });
  setTrackedDiagramStateVersion("s1", 7);
  pushRename(ctx.outbox, "Task_1", "A");

  assert.equal(ctx.api.calls.length, 0);
  win.handlers.online();
  await drain();
  await new Promise((r) => setImmediate(r));
  assert.equal(ctx.api.calls.length, 1, "online event triggers flush");
  assert.equal(globalThis.window.__PM_OPS_FLUSHED__.traces.at(-1).reason, "online");
  uninstall();
  assert.equal(Object.keys(win.handlers).length, 0, "listeners removed on uninstall");
  ctx.outbox.destroy();
});

test("window offline → flush suppressed + ops-local/offline status event; online resumes with flush", async () => {
  const ctx = makeOutbox(null);
  const win = fakeWin();
  const uninstall = installOpsOutboxNetworkTriggers(ctx.outbox, { win });
  setTrackedDiagramStateVersion("s1", 7);

  win.handlers.offline();
  assert.ok(
    ctx.statuses.some((s) => s.stage === "ops-local" && s.offline === true),
    "offline emits ops-local status (indicator signal for the later slice)",
  );

  pushRename(ctx.outbox, "Task_1", "A");
  await ctx.outbox.flushNow({ reason: "test" });
  await drain();
  assert.equal(ctx.api.calls.length, 0, "flush suppressed while offline (not a regular error)");

  win.handlers.online();
  await drain();
  await new Promise((r) => setImmediate(r));
  assert.equal(ctx.api.calls.length, 1, "flush resumes on online");
  uninstall();
  ctx.outbox.destroy();
});

test("navigator.onLine === false → flush does not start (gate independent of events)", async () => {
  const ctx = makeOutbox(null, { navigator: { onLine: false } });
  setTrackedDiagramStateVersion("s1", 7);
  pushRename(ctx.outbox, "Task_1", "A");
  await ctx.outbox.flushNow({ reason: "test" });
  await drain();
  assert.equal(ctx.api.calls.length, 0, "flush gated by navigator.onLine");
  assert.ok(
    ctx.statuses.some((s) => s.stage === "ops-local" && s.offline === true),
    "suppressed flush still signals state via status event",
  );
  ctx.outbox.destroy();
});
