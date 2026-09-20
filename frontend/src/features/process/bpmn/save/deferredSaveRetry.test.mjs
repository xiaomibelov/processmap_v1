import test from "node:test";
import assert from "node:assert/strict";

import { armDeferredSaveRetry } from "./deferredSaveRetry.js";

function makeEventBus() {
  const listeners = new Map();
  return {
    once(name, fn) {
      const set = listeners.get(name) || new Set();
      set.add(fn);
      listeners.set(name, set);
    },
    off(name, fn) {
      listeners.get(name)?.delete(fn);
    },
    fire(name) {
      const set = listeners.get(name);
      if (!set) return;
      for (const fn of [...set]) fn();
    },
    listenerCount(name) {
      return listeners.get(name)?.size || 0;
    },
  };
}

const makeModeler = (eventBus) => ({ get: (svc) => (svc === "eventBus" ? eventBus : null) });

test("fix422 RC2: retry armed — directEditing.complete дёргает retry однократно", () => {
  const eventBus = makeEventBus();
  let calls = 0;
  const armed = armDeferredSaveRetry(makeModeler(eventBus), () => { calls += 1; });
  assert.equal(armed, true);
  eventBus.fire("directEditing.complete");
  assert.equal(calls, 1, "complete → retry");
  eventBus.fire("directEditing.complete");
  eventBus.fire("directEditing.cancel");
  assert.equal(calls, 1, "одноразовый: повторные события не дёргают retry");
});

test("fix422 RC2: cancel тоже дёргает retry (blackhole-ветка без изменения текста)", () => {
  const eventBus = makeEventBus();
  let calls = 0;
  armDeferredSaveRetry(makeModeler(eventBus), () => { calls += 1; });
  eventBus.fire("directEditing.cancel");
  assert.equal(calls, 1);
});

test("fix422 RC2: без eventBus/modeler — не armed, retry не зовётся", () => {
  let calls = 0;
  assert.equal(armDeferredSaveRetry(null, () => { calls += 1; }), false);
  assert.equal(armDeferredSaveRetry({}, () => { calls += 1; }), false);
  assert.equal(calls, 0);
});
