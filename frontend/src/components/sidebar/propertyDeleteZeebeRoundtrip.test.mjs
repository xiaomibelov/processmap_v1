import test from "node:test";
import assert from "node:assert/strict";

import { deleteExtensionPropertyRowsByDeleteAction } from "./propertyDeleteSemantics.js";
import {
  normalizeCamundaExtensionState,
  normalizeCamundaExtensionsMap,
} from "../../features/process/camunda/camundaExtensions.js";

// Pure-JS (no DOM) regression tests for the zeebe property-delete leg of the x3
// bug. The delete handler (useBpmnPropertiesController.deletePropertyRow) composes
// exactly: updateDraft(deleteExtensionPropertyRowsByDeleteAction(properties, rowId)).
// These tests lock that composition for zeebe rows and prove the deleted row is
// absent from the next map and is not resurrected across a save/reload cycle.

const ZEEBE_ROWS = [
  { id: "p1", name: "ingredient", value: "микс" },
  { id: "p2", name: "container_tara", value: "дежа" },
  { id: "p3", name: "ingredient_shape", value: "куб" },
  { id: "p4", name: "ingredient_height", value: "12" },
];

function signature(rows) {
  return rows.map((row) => ({ name: row.name, value: row.value }));
}

function nextMapAfterDelete(rows, rowId) {
  // Mirror useBpmnPropertiesController.updateDraft: the filtered list becomes the
  // element's extensionProperties; listeners are preserved (empty here).
  const nextExtensionProperties = deleteExtensionPropertyRowsByDeleteAction(rows, rowId);
  return normalizeCamundaExtensionsMap({
    Task_1: {
      properties: {
        extensionProperties: nextExtensionProperties,
        extensionListeners: [],
      },
      preservedExtensionElements: [],
    },
  });
}

test("zeebe property delete removes the targeted row from the next map (visible rows after delete = 3)", () => {
  const nextMap = nextMapAfterDelete(ZEEBE_ROWS, "p1");
  const state = normalizeCamundaExtensionState(nextMap.Task_1);
  const props = state.properties.extensionProperties;
  assert.equal(props.length, 3, "exactly 3 rows remain after deleting 1 of 4");
  assert.deepEqual(signature(props), [
    { name: "container_tara", value: "дежа" },
    { name: "ingredient_shape", value: "куб" },
    { name: "ingredient_height", value: "12" },
  ]);
  assert.equal(
    props.some((row) => row.name === "ingredient" && row.value === "микс"),
    false,
    "deleted (name,value) is absent from nextMap / PUT body",
  );
});

test("zeebe delete stays x1 across a simulated save/reload (deleted row is not restored)", () => {
  const afterDelete = deleteExtensionPropertyRowsByDeleteAction(ZEEBE_ROWS, "p2");
  // Simulate save -> reload by normalizing the map twice (the reload re-derives
  // the same map; with the backend (name,value) dedup the row count is stable).
  const first = normalizeCamundaExtensionsMap({
    Task_1: { properties: { extensionProperties: afterDelete, extensionListeners: [] } },
  });
  const reloaded = normalizeCamundaExtensionsMap(first);
  const props = normalizeCamundaExtensionState(reloaded.Task_1).properties.extensionProperties;
  assert.equal(props.length, 3, "row count stays at 3 after save/reload (x1, not restored)");
  assert.equal(props.some((row) => row.name === "container_tara"), false);
});

test("zeebe delete targets by row.id and preserves same-name siblings (multi-value)", () => {
  const rows = [
    { id: "p1", name: "equipment", value: "Весы" },
    { id: "p2", name: "equipment", value: "Миксер" },
  ];
  const afterDelete = deleteExtensionPropertyRowsByDeleteAction(rows, "p1");
  assert.deepEqual(signature(afterDelete), [{ name: "equipment", value: "Миксер" }]);
});

test("zeebe delete of unknown id leaves rows unchanged (no accidental drop)", () => {
  const afterDelete = deleteExtensionPropertyRowsByDeleteAction(ZEEBE_ROWS, "does-not-exist");
  assert.equal(afterDelete.length, ZEEBE_ROWS.length);
});
