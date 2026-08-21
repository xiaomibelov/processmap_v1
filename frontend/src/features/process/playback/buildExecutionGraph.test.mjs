import assert from "node:assert/strict";
import test from "node:test";

import { buildExecutionGraphFromInstance } from "./buildExecutionGraph.js";

function makeInstanceWithRegistry(elementsRaw) {
  const elements = Array.isArray(elementsRaw) ? elementsRaw : [];
  const byId = Object.fromEntries(
    elements
      .map((element) => {
        const bo = element?.businessObject || {};
        const id = String(bo.id || element?.id || "").trim();
        return id ? [id, element] : null;
      })
      .filter(Boolean),
  );
  return {
    get(service) {
      if (service !== "elementRegistry") return null;
      return {
        getAll: () => elements,
        get: (id) => byId[String(id || "").trim()] || null,
      };
    },
  };
}

test("buildExecutionGraphFromInstance extracts link throw/catch metadata", () => {
  const startBo = {
    $type: "bpmn:StartEvent",
    id: "Start_1",
    name: "Start",
    incoming: [],
    outgoing: [{ id: "Flow_s_a" }],
  };
  const taskBo = {
    $type: "bpmn:Task",
    id: "Task_A",
    name: "A",
    incoming: [{ id: "Flow_s_a" }],
    outgoing: [{ id: "Flow_a_throw" }],
  };
  const throwBo = {
    $type: "bpmn:IntermediateThrowEvent",
    id: "Throw_1",
    name: "RESTART_SOUP",
    incoming: [{ id: "Flow_a_throw" }],
    outgoing: [],
    eventDefinitions: [{ $type: "bpmn:LinkEventDefinition", name: "RESTART_SOUP" }],
  };
  const catchBo = {
    $type: "bpmn:IntermediateCatchEvent",
    id: "Catch_1",
    name: "RESTART_SOUP",
    incoming: [],
    outgoing: [{ id: "Flow_c_b" }],
    eventDefinitions: [{ $type: "bpmn:LinkEventDefinition", name: "RESTART_SOUP" }],
  };
  const taskBBo = {
    $type: "bpmn:Task",
    id: "Task_B",
    name: "B",
    incoming: [{ id: "Flow_c_b" }],
    outgoing: [],
  };
  const flowSA = {
    $type: "bpmn:SequenceFlow",
    id: "Flow_s_a",
    sourceRef: { id: "Start_1" },
    targetRef: { id: "Task_A" },
  };
  const flowAThrow = {
    $type: "bpmn:SequenceFlow",
    id: "Flow_a_throw",
    sourceRef: { id: "Task_A" },
    targetRef: { id: "Throw_1" },
  };
  const flowCB = {
    $type: "bpmn:SequenceFlow",
    id: "Flow_c_b",
    sourceRef: { id: "Catch_1" },
    targetRef: { id: "Task_B" },
  };

  const instance = makeInstanceWithRegistry([
    { id: "Start_1", businessObject: startBo },
    { id: "Task_A", businessObject: taskBo },
    { id: "Throw_1", businessObject: throwBo },
    { id: "Catch_1", businessObject: catchBo },
    { id: "Task_B", businessObject: taskBBo },
    { id: "Flow_s_a", businessObject: flowSA },
    { id: "Flow_a_throw", businessObject: flowAThrow },
    { id: "Flow_c_b", businessObject: flowCB },
  ]);

  const graph = buildExecutionGraphFromInstance(instance);
  assert.equal(graph.ok, true);
  assert.equal(graph.nodesById.Throw_1.linkEventKind, "throw");
  assert.equal(graph.nodesById.Throw_1.linkEventName, "RESTART_SOUP");
  assert.equal(graph.nodesById.Catch_1.linkEventKind, "catch");
  assert.equal(graph.nodesById.Catch_1.linkEventName, "RESTART_SOUP");
});
