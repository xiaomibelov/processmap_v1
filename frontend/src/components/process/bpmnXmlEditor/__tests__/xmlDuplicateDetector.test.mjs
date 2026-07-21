import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { findDuplicateElements, removeDuplicates } from "../xmlDuplicateDetector.js";

function withDom(fn) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const prevDomParser = globalThis.DOMParser;
  const prevSerializer = globalThis.XMLSerializer;
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.XMLSerializer = dom.window.XMLSerializer;
  try {
    return fn();
  } finally {
    globalThis.DOMParser = prevDomParser;
    globalThis.XMLSerializer = prevSerializer;
    dom.window.close();
  }
}

const BPMN_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">`;
const BPMN_FOOTER = `  </bpmn:process>
</bpmn:definitions>`;

function wrap(body) {
  return `${BPMN_HEADER}\n${body}\n${BPMN_FOOTER}`;
}

describe("findDuplicateElements", () => {
  it("detects duplicate camunda:property siblings", () =>
    withDom(() => {
      const xml = wrap(`
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="ee_time" value="10" />
          <camunda:property name="ee_time" value="10" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>`);
      const dups = findDuplicateElements(xml);
      assert.equal(dups.length, 1);
      assert.equal(dups[0].tagName, "camunda:property");
      assert.deepEqual(dups[0].attributes, { name: "ee_time", value: "10" });
      assert.equal(dups[0].occurrenceIndex, 1);
      assert.equal(dups[0].siblingIndex, 1);
      assert.ok(dups[0].key.length > 0);
    }));

  it("detects duplicate camunda:executionListener siblings", () =>
    withDom(() => {
      const xml = wrap(`
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <camunda:executionListener event="start" class="com.example.Listener" />
        <camunda:executionListener event="start" class="com.example.Listener" />
        <camunda:executionListener event="end" class="com.example.Listener" />
      </bpmn:extensionElements>
    </bpmn:task>`);
      const dups = findDuplicateElements(xml);
      assert.equal(dups.length, 1);
      assert.equal(dups[0].tagName, "camunda:executionListener");
      assert.equal(dups[0].siblingIndex, 1);
    }));

  it("does not flag same-name properties with different values", () =>
    withDom(() => {
      const xml = wrap(`
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="ee_time" value="10" />
          <camunda:property name="ee_time" value="20" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>`);
      assert.deepEqual(findDuplicateElements(xml), []);
    }));

  it("does not flag listeners for a different event", () =>
    withDom(() => {
      const xml = wrap(`
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <camunda:executionListener event="start" class="com.example.Listener" />
        <camunda:executionListener event="end" class="com.example.Listener" />
      </bpmn:extensionElements>
    </bpmn:task>`);
      assert.deepEqual(findDuplicateElements(xml), []);
    }));

  it("detects nested duplicates inside different parents independently", () =>
    withDom(() => {
      const xml = wrap(`
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="a" value="1" />
          <camunda:property name="a" value="1" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:task id="Task_2">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="a" value="1" />
          <camunda:property name="a" value="1" />
          <camunda:property name="a" value="1" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>`);
      const dups = findDuplicateElements(xml);
      // 1 duplicate in Task_1, 2 duplicates in Task_2.
      assert.equal(dups.length, 3);
      assert.deepEqual(dups.map((d) => d.occurrenceIndex), [1, 1, 2]);
    }));

  it("returns an empty array when there are no duplicates", () =>
    withDom(() => {
      const xml = wrap(`
    <bpmn:task id="Task_1" name="Установить" />
    <bpmn:task id="Task_2" name="Проверить" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Task_1" targetRef="Task_2" />`);
      assert.deepEqual(findDuplicateElements(xml), []);
    }));

  it("detects multiple duplicate groups under one parent", () =>
    withDom(() => {
      const xml = wrap(`
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="a" value="1" />
          <camunda:property name="b" value="2" />
          <camunda:property name="a" value="1" />
          <camunda:property name="b" value="2" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>`);
      const dups = findDuplicateElements(xml);
      assert.equal(dups.length, 2);
      assert.deepEqual(dups.map((d) => d.attributes.name), ["a", "b"]);
    }));

  it("ignores whitespace-only text differences", () =>
    withDom(() => {
      const xml = `<root><item>hello</item><item>
  hello
</item><item>other</item></root>`;
      const dups = findDuplicateElements(xml);
      assert.equal(dups.length, 1);
      assert.equal(dups[0].tagName, "item");
      assert.equal(dups[0].siblingIndex, 1);
    }));

  it("treats different namespace prefixes as different tags", () =>
    withDom(() => {
      const xml = wrap(`
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="a" value="1" />
        </camunda:properties>
        <zeebe:properties>
          <zeebe:property name="a" value="1" />
        </zeebe:properties>
      </bpmn:extensionElements>
    </bpmn:task>`);
      assert.deepEqual(findDuplicateElements(xml), []);
    }));

  it("returns an empty array for invalid XML input", () =>
    withDom(() => {
      assert.deepEqual(findDuplicateElements("<root><unclosed></root>"), []);
      assert.deepEqual(findDuplicateElements("not xml at all"), []);
      assert.deepEqual(findDuplicateElements(""), []);
    }));

  it("matches CDATA content by its text value", () =>
    withDom(() => {
      const xml = `<root><doc><![CDATA[some <raw> text]]></doc><doc><![CDATA[some <raw> text]]></doc><doc>other</doc></root>`;
      const dups = findDuplicateElements(xml);
      assert.equal(dups.length, 1);
      assert.equal(dups[0].tagName, "doc");
    }));
});

describe("removeDuplicates", () => {
  it("removes duplicate siblings and keeps the first occurrence", () =>
    withDom(() => {
      const xml = `<root><item name="a" value="1"/><item name="a" value="1"/><item name="b" value="2"/></root>`;
      const { xml: out, removedCount } = removeDuplicates(xml);
      assert.equal(removedCount, 1);
      assert.equal(out.match(/<item/g).length, 2);
      assert.deepEqual(findDuplicateElements(out), []);
    }));

  it("preserves the XML declaration", () =>
    withDom(() => {
      const xml = wrap(`
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="ee_time" value="10" />
          <camunda:property name="ee_time" value="10" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>`);
      const { xml: out, removedCount } = removeDuplicates(xml);
      assert.equal(removedCount, 1);
      assert.ok(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
      assert.equal(out.match(/<camunda:property/g).length, 1);
    }));

  it("returns the original string unchanged when there are no duplicates", () =>
    withDom(() => {
      const xml = wrap(`<bpmn:task id="Task_1" />`);
      const { xml: out, removedCount } = removeDuplicates(xml);
      assert.equal(removedCount, 0);
      assert.equal(out, xml);
    }));

  it("returns the original string unchanged for invalid XML", () =>
    withDom(() => {
      const bad = "<root><unclosed></root>";
      const { xml: out, removedCount } = removeDuplicates(bad);
      assert.equal(removedCount, 0);
      assert.equal(out, bad);
    }));

  it("removes nested duplicates recursively", () =>
    withDom(() => {
      const xml = `<root><a id="1"><b x="1"/><b x="1"/></a><a id="2"><b x="1"/><b x="1"/><b x="1"/></a></root>`;
      const { xml: out, removedCount } = removeDuplicates(xml);
      assert.equal(removedCount, 3);
      assert.equal(out.match(/<b /g).length, 2);
    }));

  it("keeps CDATA intact on surviving elements", () =>
    withDom(() => {
      const xml = `<root><doc><![CDATA[<raw>]]></doc><doc><![CDATA[<raw>]]></doc><doc>keep</doc></root>`;
      const { xml: out, removedCount } = removeDuplicates(xml);
      assert.equal(removedCount, 1);
      assert.match(out, /<!\[CDATA\[<raw>\]\]>/);
      assert.match(out, /<doc>keep<\/doc>/);
    }));
});
