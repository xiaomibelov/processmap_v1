import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore from "../store/createBpmnStore.js";
import createLocalMutationStaging from "./createLocalMutationStaging.js";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-hot-path-v1 (Группа 1).
//
// BASELINE: createLocalMutationStaging.stageRuntimeChange сериализует XML из
// runtime (runtime.getXml({format:false})) ДО того, как определяется
// positional-команда. Для позиционных команд (shape.move / elements.move /
// lane.updaterefs) сериализация всё равно выполняется — проверка
// isPositionalCommand идёт ПОСЛЕ getXml (createLocalMutationStaging.js:107-121
// против :131-134). Контур намеренно меняет этот порядок (positional-команды
// не должны тянуть сериализацию), поэтому тест фиксирует текущее поведение.
// ---------------------------------------------------------------------------

function makeStaging(store, overrides = {}) {
  const getXmlCalls = [];
  const autosaveReasons = [];
  const emitted = [];
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
    cacheRaw: () => {},
    emit: (event, payload) => emitted.push({ event, payload }),
    requestAutosave: (reason) => autosaveReasons.push(reason),
    ...overrides,
  });
  return { staging, getXmlCalls, autosaveReasons, emitted };
}

test("CURRENT: shape.move serializes runtime XML (getXml) before the positional skip decision", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  const { staging, getXmlCalls, autosaveReasons } = makeStaging(store);

  const result = await staging.stageRuntimeChange({ type: "commandStack.changed", command: "shape.move" });

  assert.equal(result.ok, true);
  assert.equal(result.positional, true);
  assert.equal(result.autosaveRequested, false);
  assert.equal(result.skipReason, "positional_command");
  // КЛЮЧЕВАЯ ФИКСАЦИЯ: сериализация выполнена, несмотря на positional-skip.
  assert.deepEqual(getXmlCalls, [{ format: false }], "getXml({format:false}) is called even for positional shape.move");
  assert.equal(result.xml, "<bpmn:definitions id=\"serialized\"/>");
  assert.equal(result.xmlAuthority, "staged_local_runtime_snapshot");
  assert.deepEqual(autosaveReasons, [], "positional command must not request autosave");
});

test("CURRENT: elements.move also serializes runtime XML before the positional skip decision", async () => {
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
  assert.equal(getXmlCalls.length, 1, "elements.move still triggers serialization");
  assert.deepEqual(getXmlCalls[0], { format: false });
});

test("CURRENT: lane.updaterefs serializes runtime XML before the positional skip decision", async () => {
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
  assert.equal(getXmlCalls.length, 1, "lane.updaterefs still triggers serialization");
});

test("CONTROL: structural command serializes AND requests autosave (harness sanity)", async () => {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"old\"/>",
    rev: 5,
    dirty: false,
    lastSavedRev: 5,
  });
  const { staging, getXmlCalls, autosaveReasons } = makeStaging(store);

  const result = await staging.stageRuntimeChange({ type: "commandStack.changed", command: "shape.create" });

  assert.equal(result.positional, false);
  assert.equal(result.autosaveRequested, true);
  assert.equal(getXmlCalls.length, 1);
  assert.deepEqual(autosaveReasons, ["autosave"]);
});
