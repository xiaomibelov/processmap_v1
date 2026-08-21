import test from "node:test";
import assert from "node:assert/strict";

import { buildBpmnGraphModel, buildSemanticBpmnDiff } from "./semanticDiff.js";

function xmlA() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_1" name="Линия A">
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_2</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:task id="Task_1" name="Подготовка" />
    <bpmn:task id="Task_2" name="Проверка" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Task_1" targetRef="Task_2" name="if_ok" />
  </bpmn:process>
</bpmn:definitions>`;
}

function xmlB() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_1" name="Линия A">
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_2</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:task id="Task_1" name="Подготовка сырья" />
    <bpmn:task id="Task_2" name="Проверка партии" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Task_1" targetRef="Task_2" name="if_hot" />
  </bpmn:process>
</bpmn:definitions>`;
}

test("buildBpmnGraphModel parses tasks, lanes, and sequence flows", () => {
  const graph = buildBpmnGraphModel(xmlA());
  assert.equal(graph.ok, true);
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.lanes.length, 1);
  assert.equal(String(graph.nodes[0]?.laneId || ""), "Lane_1");
});

test("buildSemanticBpmnDiff detects changed tasks and conditions", () => {
  const diff = buildSemanticBpmnDiff(xmlA(), xmlB());
  assert.equal(diff.ok, true);
  assert.equal(diff.summary.changed.tasks, 2);
  assert.equal(diff.summary.changed.conditions, 1);
  assert.equal(diff.summary.added.tasks, 0);
  assert.equal(diff.summary.removed.tasks, 0);
});
