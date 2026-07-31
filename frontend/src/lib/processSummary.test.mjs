import { test } from "vitest";
import assert from "node:assert/strict";
import { computeProcessSummary } from "./processSummary.js";

const XML_WITH_EE = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
  <bpmn:process id="P1">
    <bpmn:laneSet>
      <bpmn:lane id="L1" name="Работа оператора"><bpmn:flowNodeRef>T1</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="L2" name="Работа оборудования"><bpmn:flowNodeRef>T2</bpmn:flowNodeRef></bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="E1" />
    <bpmn:manualTask id="T1" name="Помешать">
      <bpmn:extensionElements><camunda:properties><camunda:property name="ee_time" value="5" /></camunda:properties></bpmn:extensionElements>
    </bpmn:manualTask>
    <bpmn:serviceTask id="T2" name="Разогрев">
      <bpmn:extensionElements><camunda:properties><camunda:property name="ee_time" value="10" /></camunda:properties></bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:task id="T3" name="Упаковать">
      <bpmn:extensionElements><camunda:properties><camunda:property name="ee_time" value="2.5" /></camunda:properties></bpmn:extensionElements>
    </bpmn:task>
    <bpmn:exclusiveGateway id="G1" />
    <bpmn:subProcess id="S1">
      <bpmn:task id="S1T1"><bpmn:extensionElements><camunda:properties><camunda:property name="ee_time" value="3" /></camunda:properties></bpmn:extensionElements></bpmn:task>
    </bpmn:subProcess>
    <bpmn:endEvent id="E2" />
    <bpmn:sequenceFlow id="F1" sourceRef="T1" targetRef="T2" />
    <bpmn:sequenceFlow id="F2" sourceRef="T2" targetRef="T3" />
    <bpmn:sequenceFlow id="F3" sourceRef="T1" targetRef="S1" />
  </bpmn:process>
</bpmn:definitions>`;

const XML_NO_EE = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="P1">
    <bpmn:manualTask id="T1" name="Без тегов" />
    <bpmn:task id="T2" />
  </bpmn:process>
</bpmn:definitions>`;

test("сводка: состав, дорожки, ee_time, разрез, критический путь", () => {
  const s = computeProcessSummary(XML_WITH_EE);
  assert.equal(s.hasXml, true);
  assert.equal(s.tasks, 4); // manual T1 + service T2 + plain T3 + plain S1T1 (внутри subProcess)
  assert.equal(s.gateways, 1);
  assert.equal(s.subprocesses, 1);
  assert.equal(s.events, 2);
  assert.deepEqual(s.lanes, ["Работа оператора", "Работа оборудования"]);
  assert.equal(s.ee.present, true);
  assert.equal(s.ee.total, 20.5);
  assert.equal(s.ee.manual, 5);
  assert.equal(s.ee.equipment, 10);
  assert.equal(s.ee.unclassified, 5.5); // T3 (2.5) + S1T1 (3)
  // критический путь: T1→T2→T3 = 5+10+2.5 = 17.5 (ветка T1→S1 короче)
  assert.equal(s.ee.criticalPath, 17.5);
});

test("состояние «нет данных ee_time» — не нули", () => {
  const s = computeProcessSummary(XML_NO_EE);
  assert.equal(s.hasXml, true);
  assert.equal(s.tasks, 2);
  assert.equal(s.ee.present, false);
  assert.equal(s.ee.total, 0);
  assert.equal(s.ee.criticalPath, 0);
});

test("пустой/битый xml — hasXml=false, без падений", () => {
  assert.equal(computeProcessSummary("").hasXml, false);
  assert.equal(computeProcessSummary(null).hasXml, false);
  assert.equal(computeProcessSummary("not xml at all").hasXml, false);
  const s = computeProcessSummary("<bpmn:process><bpmn:task id='x'");
  assert.equal(typeof s.tasks, "number");
});

test("цикл в потоке не зависает", () => {
  const xml = `<bpmn:definitions xmlns:bpmn="x" xmlns:camunda="y"><bpmn:process>
    <bpmn:task id="A"><bpmn:extensionElements><camunda:properties><camunda:property name="ee_time" value="2"/></camunda:properties></bpmn:extensionElements></bpmn:task>
    <bpmn:task id="B"><bpmn:extensionElements><camunda:properties><camunda:property name="ee_time" value="3"/></camunda:properties></bpmn:extensionElements></bpmn:task>
    <bpmn:sequenceFlow id="f1" sourceRef="A" targetRef="B"/><bpmn:sequenceFlow id="f2" sourceRef="B" targetRef="A"/>
  </bpmn:process></bpmn:definitions>`;
  const s = computeProcessSummary(xml);
  assert.equal(s.ee.present, true);
  assert.ok(s.ee.criticalPath >= 3);
});
