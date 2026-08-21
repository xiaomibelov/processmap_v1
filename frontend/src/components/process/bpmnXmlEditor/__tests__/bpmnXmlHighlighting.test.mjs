import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getTagClass,
  getAttributeNameClass,
  getAttributeValueClass,
  getTextContentClass,
  bpmnXmlHighlightPlugin,
} from "../bpmnXmlHighlighting.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, "../bpmnXmlHighlighting.js");
const source = fs.readFileSync(sourcePath, "utf8");

describe("bpmnXmlHighlighting source contract", () => {
  it("exports a ViewPlugin factory", () => {
    assert.equal(typeof bpmnXmlHighlightPlugin, "function");
    const ext = bpmnXmlHighlightPlugin();
    assert.ok(ext);
  });

  it("uses syntaxTree from @codemirror/language", () => {
    assert.match(source, /syntaxTree/);
    assert.match(source, /from\s*["']@codemirror\/language["']/);
  });

  it("uses RangeSetBuilder and Decoration", () => {
    assert.match(source, /RangeSetBuilder/);
    assert.match(source, /Decoration\.mark/);
  });

  it("handles Element/TagName/AttributeName/AttributeValue/Text nodes", () => {
    assert.match(source, /"Element"/);
    assert.match(source, /"TagName"/);
    assert.match(source, /"AttributeName"/);
    assert.match(source, /"AttributeValue"/);
    assert.match(source, /"Text"/);
  });

  it("guards toLowerCase with null-safe coalescing", () => {
    assert.match(source, /String\(tagName \|\| ""\)/);
    assert.match(source, /String\(attrName \|\| ""\)/);
    assert.match(source, /\.toLowerCase\(\)/);
  });

  it("wraps buildDecorations in try-catch", () => {
    assert.match(source, /try\s*\{/);
    assert.match(source, /catch\s*\(err\)/);
    assert.match(source, /BpmnXmlHighlightPlugin error/);
  });
});

describe("getTagClass", () => {
  it("classifies BPMN process/diagram elements", () => {
    assert.equal(getTagClass("bpmn:process"), "cm-bpmn-process");
    assert.equal(getTagClass("bpmn:definitions"), "cm-bpmn-process");
    assert.equal(getTagClass("bpmn:collaboration"), "cm-bpmn-process");
  });

  it("classifies BPMN task/activity elements", () => {
    assert.equal(getTagClass("bpmn:task"), "cm-bpmn-task");
    assert.equal(getTagClass("bpmn:serviceTask"), "cm-bpmn-task");
    assert.equal(getTagClass("bpmn:subProcess"), "cm-bpmn-task");
  });

  it("classifies BPMN gateways", () => {
    assert.equal(getTagClass("bpmn:exclusiveGateway"), "cm-bpmn-gateway");
    assert.equal(getTagClass("bpmn:parallelGateway"), "cm-bpmn-gateway");
  });

  it("classifies BPMN events", () => {
    assert.equal(getTagClass("bpmn:startEvent"), "cm-bpmn-event");
    assert.equal(getTagClass("bpmn:endEvent"), "cm-bpmn-event");
  });

  it("classifies BPMN flows", () => {
    assert.equal(getTagClass("bpmn:sequenceFlow"), "cm-bpmn-flow");
    assert.equal(getTagClass("bpmn:association"), "cm-bpmn-flow");
  });

  it("classifies BPMN data/artifacts", () => {
    assert.equal(getTagClass("bpmn:dataObject"), "cm-bpmn-data");
    assert.equal(getTagClass("bpmn:textAnnotation"), "cm-bpmn-data");
  });

  it("classifies DI namespace elements", () => {
    assert.equal(getTagClass("bpmndi:BPMNShape"), "cm-bpmn-di");
    assert.equal(getTagClass("dc:Bounds"), "cm-bpmn-di");
  });

  it("classifies extension namespaces", () => {
    assert.equal(getTagClass("camunda:properties"), "cm-extension-camunda");
    assert.equal(getTagClass("camunda:property"), "cm-extension-camunda");
    assert.equal(getTagClass("pm:robotMeta"), "cm-extension-pm");
    assert.equal(getTagClass("zeebe:taskDefinition"), "cm-extension-zeebe");
  });

  it("returns null for unknown tags", () => {
    assert.equal(getTagClass("bpmn:unknown"), null);
    assert.equal(getTagClass("custom:thing"), null);
  });

  it("handles null/undefined/empty tag names", () => {
    assert.equal(getTagClass(null), null);
    assert.equal(getTagClass(undefined), null);
    assert.equal(getTagClass(""), null);
  });
});

describe("getAttributeNameClass", () => {
  it("classifies standard BPMN attributes", () => {
    assert.equal(getAttributeNameClass("id", "bpmn:task"), "cm-attr-id");
    assert.equal(getAttributeNameClass("name", "bpmn:task"), "cm-attr-name");
    assert.equal(getAttributeNameClass("value", "bpmn:task"), "cm-attr-value");
    assert.equal(getAttributeNameClass("sourceRef", "bpmn:sequenceFlow"), "cm-attr-ref");
    assert.equal(getAttributeNameClass("targetRef", "bpmn:sequenceFlow"), "cm-attr-ref");
    assert.equal(getAttributeNameClass("bpmnElement", "bpmndi:BPMNShape"), "cm-attr-ref");
  });

  it("classifies extension attributes by tag namespace", () => {
    assert.equal(getAttributeNameClass("name", "camunda:property"), "cm-extension-camunda");
    assert.equal(getAttributeNameClass("value", "camunda:property"), "cm-extension-camunda");
    assert.equal(getAttributeNameClass("key", "pm:robotMeta"), "cm-extension-pm");
    assert.equal(getAttributeNameClass("type", "zeebe:taskDefinition"), "cm-extension-zeebe");
  });

  it("handles null attribute/tag names", () => {
    assert.equal(getAttributeNameClass(null, "bpmn:task"), null);
    assert.equal(getAttributeNameClass("id", null), "cm-attr-id");
    assert.equal(getAttributeNameClass(null, null), null);
  });
});

describe("getAttributeValueClass", () => {
  it("classifies numeric values", () => {
    assert.equal(getAttributeValueClass('"10"', "value", "bpmn:task"), "cm-value-number");
    assert.equal(getAttributeValueClass('"0.25"', "value", "bpmn:task"), "cm-value-number");
  });

  it("classifies BPMN id references", () => {
    assert.equal(getAttributeValueClass('"Activity_1g1zpkh"', "sourceRef", "bpmn:sequenceFlow"), "cm-value-id");
    assert.equal(getAttributeValueClass('"Gateway_0abc"', "targetRef", "bpmn:sequenceFlow"), "cm-value-id");
  });

  it("classifies known property keys", () => {
    assert.equal(getAttributeValueClass('"ee_time"', "value", "bpmn:task"), "cm-value-key");
    assert.equal(getAttributeValueClass('"ingredient_value"', "value", "bpmn:task"), "cm-value-key");
  });

  it("classifies operation letters", () => {
    assert.equal(getAttributeValueClass('"А"', "value", "bpmn:task"), "cm-value-operation");
    assert.equal(getAttributeValueClass('"Н"', "value", "bpmn:task"), "cm-value-operation");
  });

  it("classifies unit values", () => {
    assert.equal(getAttributeValueClass('"кг"', "value", "bpmn:task"), "cm-value-unit");
    assert.equal(getAttributeValueClass('"шт"', "value", "bpmn:task"), "cm-value-unit");
  });

  it("classifies extension values by tag namespace", () => {
    assert.equal(getAttributeValueClass('"ee_time"', "value", "camunda:property"), "cm-extension-camunda");
    assert.equal(getAttributeValueClass('"true"', "flag", "pm:robotMeta"), "cm-extension-pm");
  });

  it("returns null for plain text", () => {
    assert.equal(getAttributeValueClass('"sasas"', "value", "bpmn:task"), null);
  });

  it("handles null attribute/tag names", () => {
    assert.equal(getAttributeValueClass('"Activity_1"', "id", "bpmn:task"), "cm-value-id");
    assert.equal(getAttributeValueClass('"1"', "value", "bpmn:task"), "cm-value-number");
    assert.equal(getAttributeValueClass('"x"', null, "bpmn:task"), null);
    assert.equal(getAttributeValueClass('"x"', "value", null), null);
  });
});

describe("getTextContentClass", () => {
  it("classifies textAnnotation and documentation content", () => {
    assert.equal(getTextContentClass("bpmn:textAnnotation"), "cm-content-annotation");
    assert.equal(getTextContentClass("bpmn:documentation"), "cm-content-doc");
  });

  it("returns null for other text", () => {
    assert.equal(getTextContentClass("bpmn:task"), null);
  });

  it("handles null tag name", () => {
    assert.equal(getTextContentClass(null), null);
  });
});
