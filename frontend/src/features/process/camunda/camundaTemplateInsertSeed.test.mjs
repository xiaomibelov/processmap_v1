import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyCamundaExtensionState,
  extractManagedCamundaExtensionStateFromBusinessObject,
  syncCamundaExtensionsToBpmn,
} from "./camundaExtensions.js";

function createMockModeler(elements = []) {
  const registryMap = new Map();
  const all = elements.map((entry) => {
    const id = String(entry?.id || "").trim();
    const bo = entry?.businessObject || { id };
    const el = { id, businessObject: bo };
    registryMap.set(id, el);
    return el;
  });

  const registry = {
    get(id) {
      return registryMap.get(String(id || "").trim()) || null;
    },
    getAll() {
      return all.slice();
    },
  };

  const moddle = {
    create(type, payload = {}) {
      if (type === "bpmn:ExtensionElements") {
        return {
          $type: type,
          values: Array.isArray(payload.values) ? payload.values.slice() : [],
          set(key, value) {
            this[key] = value;
          },
        };
      }
      if (type === "camunda:Properties") {
        return {
          $type: type,
          values: Array.isArray(payload.values) ? payload.values.slice() : [],
          set(key, value) {
            this[key] = value;
          },
        };
      }
      if (type === "camunda:Property") {
        return {
          $type: type,
          name: String(payload.name || ""),
          value: String(payload.value || ""),
          set(key, value) {
            this[key] = value;
          },
        };
      }
      if (type === "camunda:ExecutionListener") {
        return {
          $type: type,
          event: String(payload.event || ""),
          class: String(payload.class || ""),
          expression: String(payload.expression || ""),
          delegateExpression: String(payload.delegateExpression || ""),
          set(key, value) {
            this[key] = value;
          },
        };
      }
      throw new Error(`unexpected type: ${type}`);
    },
  };

  return {
    get(name) {
      if (name === "elementRegistry") return registry;
      if (name === "moddle") return moddle;
      return null;
    },
  };
}

test("extractManagedCamundaExtensionStateFromBusinessObject reads managed properties/listeners", () => {
  const bo = {
    id: "Task_1",
    extensionElements: {
      $type: "bpmn:ExtensionElements",
      values: [
        {
          $type: "camunda:Properties",
          values: [
            { $type: "camunda:Property", name: "source_container_ref", value: "required" },
            { $type: "camunda:Property", name: "equipment_type_id", value: "microwave" },
          ],
        },
        {
          $type: "camunda:ExecutionListener",
          event: "start",
          expression: "${notifyStart}",
        },
        {
          $type: "pm:RobotMeta",
          json: "{\"k\":\"v\"}",
        },
      ],
    },
  };
  const state = extractManagedCamundaExtensionStateFromBusinessObject(bo);
  assert.deepEqual(
    state.properties.extensionProperties.map((item) => ({ name: item.name, value: item.value })),
    [
      { name: "source_container_ref", value: "required" },
      { name: "equipment_type_id", value: "microwave" },
    ],
  );
  assert.deepEqual(
    state.properties.extensionListeners.map((item) => ({ event: item.event, type: item.type, value: item.value })),
    [
      { event: "start", type: "expression", value: "${notifyStart}" },
    ],
  );
});

test("extractManagedCamundaExtensionStateFromBusinessObject ignores non-managed extension entries", () => {
  const bo = {
    id: "Task_1",
    extensionElements: {
      $type: "bpmn:ExtensionElements",
      values: [
        { $type: "pm:RobotMeta", json: "{\"k\":\"v\"}" },
        { $type: "camunda:InputOutput", inputParameters: [], outputParameters: [] },
      ],
    },
  };
  const state = extractManagedCamundaExtensionStateFromBusinessObject(bo);
  assert.deepEqual(state, createEmptyCamundaExtensionState());
});

test("seeded managed state from BO survives syncCamundaExtensionsToBpmn", () => {
  const taskBusinessObject = {
    id: "Task_new_1",
    extensionElements: {
      $type: "bpmn:ExtensionElements",
      values: [
        {
          $type: "camunda:Properties",
          values: [
            { $type: "camunda:Property", name: "source_container_ref", value: "required" },
            { $type: "camunda:Property", name: "source_container_state", value: "legacy|new" },
            { $type: "camunda:Property", name: "equipment_type_id", value: "microwave" },
            { $type: "camunda:Property", name: "equipment_ref", value: "required_runtime" },
          ],
        },
      ],
      set(key, value) {
        this[key] = value;
      },
    },
    set(key, value) {
      this[key] = value;
    },
  };
  const seededState = extractManagedCamundaExtensionStateFromBusinessObject(taskBusinessObject);
  const modeler = createMockModeler([{ id: "Task_new_1", businessObject: taskBusinessObject }]);
  const res = syncCamundaExtensionsToBpmn({
    modeler,
    camundaExtensionsByElementId: {
      Task_new_1: seededState,
    },
  });
  assert.equal(res.ok, true);
  const propsEntry = taskBusinessObject.extensionElements.values.find((entry) => entry?.$type === "camunda:Properties");
  assert.ok(propsEntry);
  assert.deepEqual(
    propsEntry.values.map((item) => ({ name: item.name, value: item.value })),
    [
      { name: "source_container_ref", value: "required" },
      { name: "source_container_state", value: "legacy|new" },
      { name: "equipment_type_id", value: "microwave" },
      { name: "equipment_ref", value: "required_runtime" },
    ],
  );
});
