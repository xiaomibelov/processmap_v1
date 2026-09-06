import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore from "../store/createBpmnStore.js";
import createLocalMutationStaging from "./createLocalMutationStaging.js";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-hot-path-v1 (коммит 1): throttled
// keep-latest сериализация positional/drag-кадров.
//
// Семантика: серия быстрых positional-команд порождает РОВНО ОДНУ
// сериализацию (getXml format:false + setXml + cacheRaw) на trailing-краю
// окна 300мс; busy-modeler кап 5с — зависший getXml отклоняется по таймауту,
// тик пропускается без блокировки, следующая команда планирует новый тик.
// Fake timers (node:test mock.timers), реального времени нет.
// ---------------------------------------------------------------------------

// Fake timers (node:test mock.timers). В Node 20 mock.timers умеет только
// sync tick(), поэтому микротаски (async getXml / promise-цепочки) проматываем
// через реальный setImmediate — он не входит в mocked apis и ждёт drain
// микротасков.
function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function tickAndFlush(t, ms) {
  t.mock.timers.tick(ms);
  await flushMicrotasks();
}

function makeHarness(store, overrides = {}) {
  const getXmlCalls = [];
  const cacheCalls = [];
  const emitted = [];
  const autosaveReasons = [];
  const staging = createLocalMutationStaging({
    getStore: () => store,
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 9 }),
      getXml: async (options = {}) => {
        getXmlCalls.push(options);
        return { ok: true, xml: "<bpmn:definitions id=\"serialized\"/>", token: 9 };
      },
    }),
    getSessionId: () => "sid_throttled_serialization",
    cacheRaw: (sid, xml, rev, reason) => cacheCalls.push({ sid, xml, rev, reason }),
    emit: (event, payload) => emitted.push({ event, payload }),
    requestAutosave: (reason) => autosaveReasons.push(reason),
    ...overrides,
  });
  return { staging, getXmlCalls, cacheCalls, emitted, autosaveReasons };
}

test("keep-latest: 3 fast positional commands → exactly 1 getXml at the 300ms trailing edge", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"], now: 1_000_000 });
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  const { staging, getXmlCalls, cacheCalls, autosaveReasons } = makeHarness(store);

  await staging.stageRuntimeChange({ type: "commandStack.changed", command: "shape.move" });
  await staging.stageRuntimeChange({ type: "commandStack.changed", command: "shape.move" });
  await staging.stageRuntimeChange({ type: "commandStack.changed", command: "elements.move" });

  assert.equal(getXmlCalls.length, 0, "no in-frame serialization for any of the frames");

  await tickAndFlush(t, 299);
  assert.equal(getXmlCalls.length, 0, "trailing edge not reached yet");

  await tickAndFlush(t, 1);
  assert.equal(getXmlCalls.length, 1, "exactly one throttled serialization at the 300ms edge");
  assert.deepEqual(getXmlCalls[0], { format: false });
  assert.equal(store.getState().xml, "<bpmn:definitions id=\"serialized\"/>");
  // rev: 3 кадра (5→8) + один throttled setXml (8→9).
  assert.equal(store.getState().rev, 9);
  assert.equal(cacheCalls.length, 1, "cacheRaw coalesced into the single serialization");
  assert.equal(cacheCalls[0].reason, "runtime_change_throttled");
  assert.deepEqual(autosaveReasons, [], "positional frames never request autosave");

  // Дальнейшие тики без новых команд сериализации не порождают.
  await tickAndFlush(t, 5000);
  assert.equal(getXmlCalls.length, 1);
});

test("busy-modeler cap: a hanging getXml is skipped by the 5s timeout and the next command retries", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"], now: 2_000_000 });
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  const hanging = { current: true };
  const getXmlCalls = [];
  const staging = createLocalMutationStaging({
    getStore: () => store,
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 9 }),
      getXml: async (options = {}) => {
        getXmlCalls.push(options);
        if (hanging.current) {
          // Зависший modeler: не резолвится никогда — сработать должен кап 5с.
          return new Promise(() => {});
        }
        return { ok: true, xml: "<bpmn:definitions id=\"serialized\"/>", token: 9 };
      },
    }),
    getSessionId: () => "sid_throttled_busy",
    cacheRaw: () => {},
    emit: () => {},
    requestAutosave: () => {},
  });

  await staging.stageRuntimeChange({ type: "commandStack.changed", command: "shape.move" });
  await tickAndFlush(t, 300); // тик срабатывает, getXml уходит в висяк
  assert.equal(getXmlCalls.length, 1);

  // Кап 5с отклоняет зависший getXml; store-xml остаётся прежним (fallback).
  await tickAndFlush(t, 5000);
  assert.equal(store.getState().xml, "<bpmn:definitions id=\"old\"/>");
  assert.equal(store.getState().rev, 6, "only the in-frame dirty-mark rev bump happened");

  // Следующая команда после отклонения капом планирует новый тик — повторная
  // попытка сериализации идёт (modeler всё ещё висит → call#2 тоже уйдёт в кап).
  await staging.stageRuntimeChange({ type: "commandStack.changed", command: "shape.move" });
  await tickAndFlush(t, 300);
  assert.equal(getXmlCalls.length, 2, "a new tick retries serialization after the busy cap");

  // И повторный зависший тик тоже отклоняется капом без блокировки/краша.
  await tickAndFlush(t, 5000);
  assert.equal(store.getState().xml, "<bpmn:definitions id=\"old\"/>");

  // Модер ожил: следующая команда сериализуется один раз.
  hanging.current = false;
  await staging.stageRuntimeChange({ type: "commandStack.changed", command: "shape.move" });
  await tickAndFlush(t, 300);
  assert.equal(getXmlCalls.length, 3);
  assert.equal(store.getState().xml, "<bpmn:definitions id=\"serialized\"/>");
});
