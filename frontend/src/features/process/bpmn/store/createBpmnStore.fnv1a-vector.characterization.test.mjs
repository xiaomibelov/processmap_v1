import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore, { fnv1aHex as storeFnv1aHex } from "./createBpmnStore.js";
import { fnv1aHex as helpersFnv1aHex } from "../coordinator/createBpmnCoordinator.helpers.js";
import { normalizeCamundaExtensionState } from "../../camunda/camundaExtensions.js";
import createBpmnPersistence from "../persistence/createBpmnPersistence.js";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-hot-path-v1 (Группа 5).
//
// BASELINE: FNV-1a хэш реализован КОПИЯМИ в нескольких модулях save hot-path:
//   - store/createBpmnStore.js (export fnv1aHex)            — store snapshots
//   - persistence/createBpmnPersistence.js (private)        — runtime cache hash
//   - coordinator/createBpmnCoordinator.helpers.js (export) — flush skip-check
//   - camunda/camundaExtensions.js (private, через row-id)  — extension row ids
// (доп. копии: snapshots/bpmnSnapshots.js, stage/runtimeHelpers/bpmnStagePureHelpers.js
//  — неэкспортируемые, косвенно не наблюдаемы здесь).
// Все копии дают ОДИНАКОВЫЙ результат на одной строке. Контур планирует
// рефакторинг к единой реализации — вектор ниже фиксирует ожидаемые значения,
// чтобы рефакторинг можно было доказать эквивалентным.
// ---------------------------------------------------------------------------

// [input, expected FNV-1a hex] — значения вычислены эталонной реализацией.
const VECTOR = [
  ["<bpmn:definitions id=\"x\"/>", "6a5542f7"],
  ["", "811c9dc5"],
  ["процесс-юникод-строка", "f9a4f755"],
  ["<bpmn:process id=\"P1\"><bpmn:task id=\"T1\" name=\"Mix\"/></bpmn:process>", "6b833a67"],
  ["a", "e40c292c"],
];

function persistenceHash(xml) {
  const setItemCalls = [];
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const prevWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      setItem: (key, value) => setItemCalls.push({ key, value: String(value) }),
      getItem: () => null,
    },
  };
  try {
    const persistence = createBpmnPersistence({});
    persistence.cacheRaw("sid_fnv1a_vector", xml, 1, "runtime_change");
    assert.equal(setItemCalls.length, 1, "cacheRaw must write runtime cache");
    return JSON.parse(setItemCalls[0].value).hash;
  } finally {
    if (hadWindow) globalThis.window = prevWindow;
    else delete globalThis.window;
  }
}

test("CURRENT: store/helpers fnv1a copies agree on the fixed vector", () => {
  for (const [input, expected] of VECTOR) {
    assert.equal(storeFnv1aHex(input), expected, `store fnv1aHex(${JSON.stringify(input)})`);
    assert.equal(helpersFnv1aHex(input), expected, `helpers fnv1aHex(${JSON.stringify(input)})`);
  }
});

test("CURRENT: persistence fnv1a copy (runtime cache hash) agrees on the vector", () => {
  // Пустая строка исключена: writeRuntimeCache by design не пишет пустой xml
  // в localStorage (createBpmnPersistence.js:201), поэтому копия persistence
  // на "" косвенно не наблюдаема.
  for (const [input, expected] of VECTOR.filter(([s]) => s.length > 0)) {
    assert.equal(persistenceHash(input), expected, `persistence cache hash(${JSON.stringify(input)})`);
  }
});

test("CURRENT: camundaExtensions fnv1a copy agrees (via content-derived row id)", () => {
  // hashExtensionPropertyRowId(name, value) = `prop_${fnv1aHex(name + "\0" + value)}`
  const state = normalizeCamundaExtensionState({
    properties: {
      extensionProperties: [{ name: "key", value: "value" }],
      extensionListeners: [],
    },
    preservedExtensionElements: [],
  });
  const row = state.properties.extensionProperties[0];
  assert.equal(row.id, `prop_${storeFnv1aHex("key\u0000value")}`);
  assert.equal(row.id, `prop_${helpersFnv1aHex("key\u0000value")}`);
});

test("CURRENT: store hash plumbing (initial hash / setXml / markSaved) uses the same fnv1a", () => {
  const xml = "<bpmn:definitions id=\"x\"/>";
  const store = createBpmnStore({ xml });
  assert.equal(store.getState().hash, "6a5542f7");
  const next = "<bpmn:definitions id=\"y\"/>";
  store.setXml(next, "test");
  assert.equal(store.getState().hash, storeFnv1aHex(next));
  store.markSaved(2, storeFnv1aHex(next));
  assert.equal(store.getState().savedHash, storeFnv1aHex(next));
});
