import test from "node:test";
import assert from "node:assert/strict";
import { BpmnModdle } from "bpmn-moddle";

import camundaModdleDescriptor from "./camundaModdleDescriptor.js";
import zeebeModdleDescriptor from "./zeebeModdleDescriptor.js";
import pmModdleDescriptor from "../robotmeta/pmModdleDescriptor.js";

const MIXED_TASK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
                  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" name="Добавить ингредиент">
      <bpmn:extensionElements>
        <zeebe:properties>
          <zeebe:property name="ingredient" value="микс" />
          <zeebe:property name="container_tara" value="12" />
        </zeebe:properties>
        <camunda:properties>
          <camunda:property name="priority" value="high" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>`;

async function loadTask(xml) {
  const moddle = new BpmnModdle({
    pm: pmModdleDescriptor,
    camunda: camundaModdleDescriptor,
    zeebe: zeebeModdleDescriptor,
  });
  const { rootElement } = await moddle.fromXML(xml, "bpmn:Definitions");
  return rootElement.rootElements[0].flowElements.find((entry) => entry?.id === "Task_1") || null;
}

test("zeebe moddle descriptor parses zeebe:property into businessObject.extensionElements", async () => {
  const task = await loadTask(MIXED_TASK_XML);
  assert.ok(task, "task parsed");
  const values = task.extensionElements?.values || [];
  const zeebeProps = values.find((entry) => entry?.$type === "zeebe:Properties");
  assert.ok(zeebeProps, "zeebe:Properties is materialized in businessObject");
  const names = (zeebeProps.values || []).map((prop) => prop.name);
  assert.deepEqual(names, ["ingredient", "container_tara"]);
  assert.equal(zeebeProps.values[0].value, "микс");
});

test("camunda:Properties still parse when zeebe descriptor is registered (regression)", async () => {
  const task = await loadTask(MIXED_TASK_XML);
  const values = task.extensionElements?.values || [];
  const camundaProps = values.find((entry) => entry?.$type === "camunda:Properties");
  assert.ok(camundaProps, "camunda:Properties still materialized");
  assert.equal(camundaProps.values[0].name, "priority");
  assert.equal(camundaProps.values[0].value, "high");
});
