import test from "node:test";
import assert from "node:assert/strict";

import { applyCamundaExtensionStateToModeler } from "./camundaExtensions.js";

function createMockModeler(initialValues) {
  const bo = {
    $type: "bpmn:Task",
    id: "Task_1",
    extensionElements: { $type: "bpmn:ExtensionElements", values: initialValues },
  };
  const el = { id: "Task_1", businessObject: bo };
  const moddle = {
    create(type, attrs = {}) {
      return { $type: String(type), ...attrs };
    },
  };
  const registry = { get: (id) => (id === "Task_1" ? el : null) };
  const modeling = {
    updateProperties(element, props) {
      if (props && Object.prototype.hasOwnProperty.call(props, "extensionElements")) {
        element.businessObject.extensionElements = props.extensionElements;
      }
    },
  };
  const modeler = {
    get: (name) => {
      if (name === "elementRegistry") return registry;
      if (name === "moddle") return moddle;
      if (name === "modeling") return modeling;
      return null;
    },
  };
  return { modeler, el };
}

function propsContainers(values) {
  return (values || []).filter((entry) => (
    entry?.$type === "zeebe:Properties" || entry?.$type === "camunda:Properties"
  ));
}

test("apply writes zeebe:Property for a zeebe element and collapses mixed containers", () => {
  const { modeler, el } = createMockModeler([
    { $type: "zeebe:Properties", values: [{ $type: "zeebe:Property", name: "ingredient", value: "old" }] },
    { $type: "camunda:Properties", values: [{ $type: "camunda:Property", name: "ingredient", value: "old" }] },
  ]);
  const state = {
    properties: {
      extensionProperties: [{ id: "p1", name: "ingredient", value: "new" }],
      extensionListeners: [],
    },
  };
  const res = applyCamundaExtensionStateToModeler("Task_1", state, modeler);
  assert.equal(res.ok, true);
  const containers = propsContainers(el.businessObject.extensionElements.values);
  assert.equal(containers.length, 1, "exactly one properties container after apply");
  assert.equal(containers[0].$type, "zeebe:Properties", "zeebe element keeps zeebe namespace");
  assert.equal(containers[0].values[0].$type, "zeebe:Property");
  assert.equal(containers[0].values[0].name, "ingredient");
  assert.equal(containers[0].values[0].value, "new");
});

test("apply keeps camunda:Property for a camunda-only element (fallback, no regression)", () => {
  const { modeler, el } = createMockModeler([
    { $type: "camunda:Properties", values: [{ $type: "camunda:Property", name: "priority", value: "low" }] },
  ]);
  const state = {
    properties: {
      extensionProperties: [{ id: "p1", name: "priority", value: "high" }],
      extensionListeners: [],
    },
  };
  applyCamundaExtensionStateToModeler("Task_1", state, modeler);
  const containers = propsContainers(el.businessObject.extensionElements.values);
  assert.equal(containers.length, 1);
  assert.equal(containers[0].$type, "camunda:Properties");
  assert.equal(containers[0].values[0].value, "high");
});

test("repeated apply does not duplicate properties (idempotent per namespace)", () => {
  const { modeler, el } = createMockModeler([
    { $type: "zeebe:Properties", values: [{ $type: "zeebe:Property", name: "ingredient", value: "a" }] },
  ]);
  const state = {
    properties: {
      extensionProperties: [{ id: "p1", name: "ingredient", value: "b" }],
      extensionListeners: [],
    },
  };
  applyCamundaExtensionStateToModeler("Task_1", state, modeler);
  applyCamundaExtensionStateToModeler("Task_1", state, modeler);
  const containers = propsContainers(el.businessObject.extensionElements.values);
  assert.equal(containers.length, 1);
  assert.equal(containers[0].$type, "zeebe:Properties");
  assert.equal(containers[0].values.length, 1);
  assert.equal(containers[0].values[0].value, "b");
});
