import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRemoteSaveHighlightView,
  deriveRemoteChangedElementIds,
} from "./remoteSaveHighlightModel.js";

const XML_BEFORE = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="100" y="120" width="120" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const XML_AFTER = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_1" />
    <bpmn:task id="Task_2" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="180" y="120" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_2_di" bpmnElement="Task_2">
        <dc:Bounds x="360" y="120" width="120" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

test("deriveRemoteChangedElementIds detects geometry and semantic id changes for bpmn_xml updates", () => {
  const ids = deriveRemoteChangedElementIds({
    previousXmlRaw: XML_BEFORE,
    nextXmlRaw: XML_AFTER,
    changedKeysRaw: ["bpmn_xml"],
  });
  assert.equal(ids.includes("Task_1"), true);
  assert.equal(ids.includes("Task_2"), true);
});

test("deriveRemoteChangedElementIds ignores non-xml changed keys", () => {
  const ids = deriveRemoteChangedElementIds({
    previousXmlRaw: XML_BEFORE,
    nextXmlRaw: XML_AFTER,
    changedKeysRaw: ["bpmn_meta"],
  });
  assert.deepEqual(ids, []);
});

test("buildRemoteSaveHighlightView returns concise user-facing label", () => {
  const view = buildRemoteSaveHighlightView({
    actorLabelRaw: "Анна",
    changedElementIdsRaw: ["Task_1", "Task_2", "Flow_1"],
    changedKeysRaw: ["bpmn_xml"],
    atRaw: 1776147496,
  });
  assert.equal(view.visible, true);
  assert.match(view.label, /Анна/);
  assert.match(view.label, /3/);
  assert.match(view.title, /Task_1/);
  assert.equal(view.refreshLabel, "Обновить сессию");
  assert.match(view.refreshHint, /другого участника/i);
});
