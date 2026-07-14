import test from "node:test";
import assert from "node:assert/strict";
import {
  extractManagedCamundaExtensionStateFromBusinessObject,
  normalizeCamundaExtensionState,
} from "./camundaExtensions.js";

const NUL = String.fromCharCode(0);

// Local copy of the fnv1aHex convention used for content-derived row ids.
// Pinning it here makes any algorithm change a deliberate test update.
function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function expectedRowId(name, value) {
  return `prop_${fnv1aHex(`${name}${NUL}${value}`)}`;
}

function propertyRows(state) {
  return state?.properties?.extensionProperties || [];
}

test("normalize: rows without ids get deterministic content ids", () => {
  const input = {
    properties: {
      extensionProperties: [
        { name: "container", value: "Лоток 150x55" },
        { name: "equipment", value: "Весы высокоточные" },
      ],
    },
  };
  const first = propertyRows(normalizeCamundaExtensionState(input));
  const second = propertyRows(normalizeCamundaExtensionState(input));
  assert.equal(first[0].id, expectedRowId("container", "Лоток 150x55"));
  assert.equal(first[1].id, expectedRowId("equipment", "Весы высокоточные"));
  assert.deepEqual(first.map((r) => r.id), second.map((r) => r.id));
});

test("normalize: explicit ids (backend meta rows) are preserved", () => {
  const state = normalizeCamundaExtensionState({
    properties: {
      extensionProperties: [{ id: "prop_be_123", name: "container", value: "x" }],
    },
  });
  assert.equal(propertyRows(state)[0].id, "prop_be_123");
});

test("normalize: a value edit changes only that row's id", () => {
  const before = propertyRows(normalizeCamundaExtensionState({
    properties: {
      extensionProperties: [
        { name: "a", value: "1" },
        { name: "b", value: "2" },
      ],
    },
  }));
  const after = propertyRows(normalizeCamundaExtensionState({
    properties: {
      extensionProperties: [
        { name: "a", value: "1" },
        { name: "b", value: "popover" },
      ],
    },
  }));
  assert.equal(before[0].id, after[0].id);
  assert.notEqual(before[1].id, after[1].id);
  assert.equal(after[1].id, expectedRowId("b", "popover"));
});

test("normalize: exact duplicate rows get unique order-stable suffixed ids", () => {
  const input = {
    properties: {
      extensionProperties: [
        { name: "dup", value: "same" },
        { name: "other", value: "v" },
        { name: "dup", value: "same" },
      ],
    },
  };
  const first = propertyRows(normalizeCamundaExtensionState(input));
  const second = propertyRows(normalizeCamundaExtensionState(input));
  const ids = first.map((r) => r.id);
  assert.equal(new Set(ids).size, 3);
  assert.equal(ids[0], expectedRowId("dup", "same"));
  assert.equal(ids[2], `${expectedRowId("dup", "same")}_2`);
  assert.deepEqual(ids, second.map((r) => r.id));
});

test("modeler read: businessObject derivation is id-stable across re-reads", () => {
  const businessObject = {
    $type: "bpmn:Task",
    extensionElements: {
      $type: "bpmn:ExtensionElements",
      values: [
        {
          $type: "camunda:Properties",
          values: [
            { $type: "camunda:Property", name: "container", value: "Лоток 150x55" },
            { $type: "camunda:Property", name: "equipment", value: "Весы" },
          ],
        },
      ],
    },
  };
  const first = propertyRows(extractManagedCamundaExtensionStateFromBusinessObject(businessObject));
  assert.equal(first[0].id, expectedRowId("container", "Лоток 150x55"));
  assert.equal(first[1].id, expectedRowId("equipment", "Весы"));

  // Simulate a canvas popover write: same business object, one value changed.
  businessObject.extensionElements.values[0].values[1].value = "Весы высокоточные";
  const second = propertyRows(extractManagedCamundaExtensionStateFromBusinessObject(businessObject));
  assert.equal(second[0].id, first[0].id);
  assert.equal(second[1].id, expectedRowId("equipment", "Весы высокоточные"));
});

test("modeler read: moddle property ids are honored when present", () => {
  const state = extractManagedCamundaExtensionStateFromBusinessObject({
    $type: "bpmn:Task",
    extensionElements: {
      $type: "bpmn:ExtensionElements",
      values: [
        {
          $type: "camunda:Properties",
          values: [{ $type: "camunda:Property", id: "prop_moddle_1", name: "a", value: "1" }],
        },
      ],
    },
  });
  assert.equal(propertyRows(state)[0].id, "prop_moddle_1");
});
