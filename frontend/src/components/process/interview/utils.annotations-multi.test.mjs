import test from "node:test";
import assert from "node:assert/strict";

import {
  extractTextAnnotationsByTarget,
  parseTextAnnotationsByNodeFromBpmnXml,
  parseAnnotationTree,
} from "./utils.js";

const supportsDomParser = typeof DOMParser !== "undefined";

test(
  "extractTextAnnotationsByTarget: reads all annotations for element with both association directions",
  { skip: supportsDomParser ? false : "DOMParser unavailable in node:test runtime" },
  () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1">
    <bpmn:task id="Activity_1" name="Task A" />
    <bpmn:textAnnotation id="Annotation_1"><bpmn:text>Первый комментарий</bpmn:text></bpmn:textAnnotation>
    <bpmn:textAnnotation id="Annotation_2"><bpmn:text>Второй комментарий</bpmn:text></bpmn:textAnnotation>
    <bpmn:textAnnotation id="Annotation_3"><bpmn:text>Третий комментарий</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="Association_1" sourceRef="Activity_1" targetRef="Annotation_1" />
    <bpmn:association id="Association_2" sourceRef="Annotation_2" targetRef="Activity_1" />
    <bpmn:association id="Association_3" sourceRef="Activity_1" targetRef="Annotation_3" />
  </bpmn:process>
</bpmn:definitions>`;

  const byTarget = extractTextAnnotationsByTarget(xml);
  assert.equal(Array.isArray(byTarget.Activity_1), true);
  assert.equal(byTarget.Activity_1.length, 3);
  assert.deepEqual(
    byTarget.Activity_1.map((x) => x.text),
    ["Первый комментарий", "Второй комментарий", "Третий комментарий"],
  );

  const byText = parseTextAnnotationsByNodeFromBpmnXml(xml);
  assert.deepEqual(byText.Activity_1, ["Первый комментарий", "Второй комментарий", "Третий комментарий"]);
  },
);

test("parseAnnotationTree: builds nested tree from simple heading prefixes", () => {
  const tree = parseAnnotationTree([
    "[#] Блок A",
    "[##] Подблок A1",
    "[##] Подблок A2",
    "[#] Блок B",
  ].join("\n"));

  assert.equal(tree.length, 2);
  assert.equal(tree[0].titleLine, "Блок A");
  assert.equal(tree[0].children.length, 2);
  assert.equal(tree[0].children[0].titleLine, "Подблок A1");
  assert.equal(tree[1].titleLine, "Блок B");
});

test("parseAnnotationTree: keeps plain text as single leaf node", () => {
  const tree = parseAnnotationTree("Строка 1\nСтрока 2\nСтрока 3");
  assert.equal(tree.length, 1);
  assert.equal(tree[0].titleLine, "Строка 1");
  assert.equal(tree[0].body, "Строка 2\nСтрока 3");
});
