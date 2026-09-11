import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore from "../store/createBpmnStore.js";
import createLocalMutationStaging from "./createLocalMutationStaging.js";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-hot-path-v1 (Группа 1) — ПЕРЕВЁРНУТО
// коммитом 1 («сериализация вне кадра»).
//
// BASELINE (зафиксировано коммитом e1543631): stageRuntimeChange сериализовал
// XML из runtime (runtime.getXml({format:false})) ДО определения
// positional-команды — полная сериализация на каждый кадр drag.
//
// НОВОЕ ПОВЕДЕНИЕ: проверка isPositionalCommand/getIsDragging выполняется ДО
// сериализации. На positional/drag-кадре getXml НЕ вызывается; dirty-mark
// (rev-bump + dirty:true + fanout setXml) выполняется от текущего store-xml
// (по содержимому no-op, но бампает rev/dirty и дергает подписчиков);
// сериализация откладывается в throttled keep-latest (300мс trailing): один
// getXml + store.setXml + cacheRaw. Автосейв-skip для positional-кадров без
// изменений.
//
// ОБНОВЛЕНО контуром fix/canvas-250-editing-performance: structural-команды
// (shape.create и др.) больше НЕ сериализуются немедленно — они уходят в тот
// же throttled keep-latest путь (in-frame только синхронный dirty-mark).
// Полный saveXML на каждую команду был O(n) на схемах 250+ элементов.
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeStaging(store, overrides = {}) {
  const getXmlCalls = [];
  const autosaveReasons = [];
  const emitted = [];
  const cacheCalls = [];
  const staging = createLocalMutationStaging({
    getStore: () => store,
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 9 }),
      getXml: async (options = {}) => {
        getXmlCalls.push(options);
        return { ok: true, xml: "<bpmn:definitions id=\"serialized\"/>", token: 9 };
      },
    }),
    getSessionId: () => "sid_positional_serialization",
    cacheRaw: (sid, xml, rev, reason) => cacheCalls.push({ sid, xml, rev, reason }),
    emit: (event, payload) => emitted.push({ event, payload }),
    requestAutosave: (reason) => autosaveReasons.push(reason),
    ...overrides,
  });
  return { staging, getXmlCalls, autosaveReasons, emitted, cacheCalls };
}

test("FIXED: shape.move does NOT serialize in-frame; dirty-mark happens; throttled snapshot fires once", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  const { staging, getXmlCalls, autosaveReasons, emitted, cacheCalls } = makeStaging(store);

  const result = await staging.stageRuntimeChange({ type: "commandStack.changed", command: "shape.move" });

  assert.equal(result.ok, true);
  assert.equal(result.positional, true);
  assert.equal(result.autosaveRequested, false);
  assert.equal(result.skipReason, "positional_command");
  // КЛЮЧЕВАЯ ФИКСАЦИЯ (новое поведение): в кадре сериализации НЕТ.
  assert.deepEqual(getXmlCalls, [], "getXml({format:false}) is NOT called on a positional frame");
  assert.equal(result.xml, "<bpmn:definitions id=\"old\"/>");
  assert.equal(result.xmlAuthority, "staged_local_store_fallback");
  assert.equal(result.xmlExportMode, "store_fallback");
  // dirty-mark при этом выполнен: rev-bump + dirty + fanout.
  assert.equal(store.getState().rev, 6);
  assert.equal(store.getState().dirty, true);
  assert.deepEqual(autosaveReasons, [], "positional command must not request autosave");
  assert.ok(emitted.some((e) => e.event === "STAGE_POSITIONAL_CHANGE" && e.payload.reason === "positional_command"));

  // Throttled keep-latest: ровно одна сериализация после trailing-окна 300мс.
  await sleep(360);
  assert.equal(getXmlCalls.length, 1, "exactly one throttled serialization after the 300ms window");
  assert.deepEqual(getXmlCalls[0], { format: false });
  assert.equal(store.getState().xml, "<bpmn:definitions id=\"serialized\"/>");
  assert.equal(store.getState().rev, 7, "throttled snapshot bumps rev once more");
  assert.equal(cacheCalls.length, 1, "cacheRaw runs on the throttled serialization, not per frame");
  assert.equal(cacheCalls[0].reason, "runtime_change_throttled");
  assert.equal(cacheCalls[0].xml, "<bpmn:definitions id=\"serialized\"/>");
});

test("FIXED: elements.move also skips in-frame serialization", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  const { staging, getXmlCalls } = makeStaging(store);

  const result = await staging.stageRuntimeChange({ type: "commandStack.changed", command: "elements.move" });

  assert.equal(result.positional, true);
  assert.equal(result.skipReason, "positional_command");
  assert.equal(getXmlCalls.length, 0, "elements.move does not serialize in-frame");

  await sleep(360);
  assert.equal(getXmlCalls.length, 1, "throttled serialization follows after the window");
});

test("FIXED: lane.updaterefs skips in-frame serialization too", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  const { staging, getXmlCalls } = makeStaging(store);

  const result = await staging.stageRuntimeChange({ type: "commandStack.changed", command: "lane.updaterefs" });

  assert.equal(result.positional, true);
  assert.equal(result.skipReason, "positional_command");
  assert.equal(getXmlCalls.length, 0, "lane.updaterefs does not serialize in-frame");

  await sleep(360);
  assert.equal(getXmlCalls.length, 1);
});

test("FIXED: structural command during drag is throttled (no in-frame serialization, autosave skipped)", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  const { staging, getXmlCalls, autosaveReasons } = makeStaging(store, { getIsDragging: () => true });

  const result = await staging.stageRuntimeChange({ type: "commandStack.changed", command: "shape.create" });

  assert.equal(result.positional, true);
  assert.equal(result.autosaveRequested, false);
  assert.equal(result.skipReason, "drag_in_progress");
  assert.equal(getXmlCalls.length, 0, "structural command during drag does not serialize in-frame");
  assert.deepEqual(autosaveReasons, []);
  // dirty-mark всё равно выполнен.
  assert.equal(store.getState().rev, 6);
  assert.equal(store.getState().dirty, true);

  await sleep(360);
  assert.equal(getXmlCalls.length, 1, "drag-frame serialization coalesced into one throttled snapshot");
  assert.equal(store.getState().xml, "<bpmn:definitions id=\"serialized\"/>");
});

test("CHANGED: structural shape.create is throttled too (no in-frame serialization, autosave requested)", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  const { staging, getXmlCalls, autosaveReasons, cacheCalls } = makeStaging(store);

  const result = await staging.stageRuntimeChange({ type: "commandStack.changed", command: "shape.create" });

  assert.equal(result.positional, false);
  assert.equal(result.autosaveRequested, true);
  assert.deepEqual(autosaveReasons, ["autosave"], "structural command still requests autosave in-frame");
  assert.equal(getXmlCalls.length, 0, "structural command does not serialize in-frame anymore");
  assert.equal(result.xml, "<bpmn:definitions id=\"old\"/>");
  assert.equal(result.xmlAuthority, "staged_local_store_fallback");
  assert.equal(store.getState().dirty, true, "in-frame dirty-mark is synchronous");

  // Ровно одна сериализация на trailing-краю окна, без in-frame дубля.
  await sleep(360);
  assert.equal(getXmlCalls.length, 1, "structural command coalesces into one throttled serialization");
  assert.deepEqual(getXmlCalls[0], { format: false });
  assert.equal(store.getState().xml, "<bpmn:definitions id=\"serialized\"/>");
  assert.equal(cacheCalls.length, 1);
  assert.equal(cacheCalls[0].reason, "runtime_change_throttled");
});
