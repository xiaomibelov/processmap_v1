import assert from "node:assert/strict";
import test from "node:test";

import {
  isTechnicalBpmnId,
  normalizeTechnicalBpmnLabelsInXml,
  readableBpmnText,
} from "./bpmnIdentity.js";

test("isTechnicalBpmnId detects BPMN runtime ids without matching readable labels", () => {
  assert.equal(isTechnicalBpmnId("Activity_02r3c3z"), true);
  assert.equal(isTechnicalBpmnId("Task_1"), true);
  assert.equal(isTechnicalBpmnId("Проверить температуру"), false);
  assert.equal(isTechnicalBpmnId("Activity check"), false);
});

test("readableBpmnText skips technical ids and returns the first readable label", () => {
  assert.equal(readableBpmnText("Activity_02r3c3z", "Проверить температуру"), "Проверить температуру");
  assert.equal(readableBpmnText("Activity_02r3c3z", ""), "");
});

test("normalizeTechnicalBpmnLabelsInXml is browser-gated in non-DOM test runtimes", () => {
  const previousDomParser = globalThis.DOMParser;
  const previousXmlSerializer = globalThis.XMLSerializer;
  try {
    delete globalThis.DOMParser;
    delete globalThis.XMLSerializer;
    const xml = '<bpmn:task id="Activity_02r3c3z" name="Activity_02r3c3z" />';
    assert.equal(
      normalizeTechnicalBpmnLabelsInXml(xml, [{ id: "Activity_02r3c3z", title: "Проверить температуру" }]),
      xml,
    );
  } finally {
    globalThis.DOMParser = previousDomParser;
    globalThis.XMLSerializer = previousXmlSerializer;
  }
});

test("normalizeTechnicalBpmnLabelsInXml writes readable labels into existing technical BPMN names", { skip: typeof DOMParser === "undefined" }, () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1">
    <bpmn:task id="Activity_02r3c3z" name="Activity_02r3c3z" />
    <bpmn:task id="Activity_empty" />
    <bpmn:exclusiveGateway id="Gateway_1" name="Gateway_1" />
  </bpmn:process>
</bpmn:definitions>`;

  const out = normalizeTechnicalBpmnLabelsInXml(xml, [
    { id: "Activity_02r3c3z", title: "Проверить температуру" },
  ]);

  assert.match(out, /id="Activity_02r3c3z" name="Проверить температуру"/);
  assert.match(out, /id="Activity_empty" name="Шаг 2"/);
  assert.match(out, /id="Gateway_1" name="Решение 1"/);
  assert.doesNotMatch(out, /name="Activity_02r3c3z"/);
});
