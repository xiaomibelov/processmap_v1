import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prettyPrintXml } from "../prettyPrintXml.js";

const bpmnFragment = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
<bpmn:process id="Process_1" isExecutable="false"><bpmn:task id="Task_1" name="Установить"><bpmn:documentation>Нужно установить &amp; проверить</bpmn:documentation><bpmn:extensionElements><camunda:properties><camunda:property name="ee_time" value="10" /><camunda:property name="ingredient_um" value="кг" /></camunda:properties></bpmn:extensionElements></bpmn:task><bpmn:sequenceFlow id="Flow_1" sourceRef="Task_1" targetRef="Task_2" /></bpmn:process>
</bpmn:definitions>`;

describe("prettyPrintXml", () => {
  it("returns empty string for empty input", () => {
    assert.equal(prettyPrintXml(""), "");
    assert.equal(prettyPrintXml("   "), "");
  });

  it("formats a simple XML with 2-space indentation", () => {
    const input = "<root><child>text</child></root>";
    const out = prettyPrintXml(input);
    assert.match(out, /<root>\n/);
    assert.match(out, /\n  <child>\n    text\n  <\/child>\n/);
    assert.match(out, /\n<\/root>$/);
  });

  it("keeps XML declaration on the first line", () => {
    const out = prettyPrintXml(bpmnFragment);
    const firstLine = out.split("\n")[0];
    assert.equal(firstLine, '<?xml version="1.0" encoding="UTF-8"?>');
  });

  it("indents BPMN tags correctly", () => {
    const out = prettyPrintXml(bpmnFragment);
    assert.match(out, /\n  <bpmn:process/);
    assert.match(out, /\n    <bpmn:task/);
    assert.match(out, /\n      <bpmn:documentation>/);
    assert.match(out, /\n    <\/bpmn:task>/);
    assert.match(out, /\n  <\/bpmn:process>/);
  });

  it("preserves self-closing tags", () => {
    const out = prettyPrintXml(bpmnFragment);
    assert.match(out, /<camunda:property name="ee_time" value="10" \/>/);
    assert.match(out, /<bpmn:sequenceFlow id="Flow_1" sourceRef="Task_1" targetRef="Task_2" \/>/);
  });

  it("preserves entities inside text nodes", () => {
    const out = prettyPrintXml(bpmnFragment);
    assert.match(out, /Нужно установить &amp; проверить/);
  });

  it("is idempotent", () => {
    const once = prettyPrintXml(bpmnFragment);
    const twice = prettyPrintXml(once);
    assert.equal(once, twice);
  });

  it("preserves CDATA content", () => {
    const input = "<root><![CDATA[<not>parsed</not>]]></root>";
    const out = prettyPrintXml(input);
    assert.match(out, /<!\[CDATA\[<not>parsed<\/not>\]\]>/);
  });

  it("preserves comments", () => {
    const input = "<root><!-- comment --><child /></root>";
    const out = prettyPrintXml(input);
    assert.match(out, /<!-- comment -->/);
  });

  it("keeps namespace declarations intact", () => {
    const out = prettyPrintXml(bpmnFragment);
    assert.match(out, /xmlns:bpmn="http:\/\/www\.omg\.org\/spec\/BPMN\/20100524\/MODEL"/);
    assert.match(out, /xmlns:camunda="http:\/\/camunda\.org\/schema\/1\.0\/bpmn"/);
  });

  it("does not change attribute order or values", () => {
    const out = prettyPrintXml(bpmnFragment);
    assert.match(out, /id="Task_1" name="Установить"/);
    assert.match(out, /name="ee_time" value="10"/);
  });
});
