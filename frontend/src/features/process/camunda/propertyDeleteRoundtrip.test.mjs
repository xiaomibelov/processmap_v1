import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { deleteExtensionPropertyRowsByDeleteAction } from "../../../components/sidebar/propertyDeleteSemantics.js";
import {
  extractCamundaExtensionsMapFromBpmnXml,
  finalizeCamundaExtensionsXml,
  hydrateCamundaExtensionsFromBpmn,
  normalizeCamundaExtensionState,
  normalizeCamundaExtensionsMap,
} from "./camundaExtensions.js";
import { buildVisibleExtensionPropertyRows } from "./propertyDictionaryModel.js";

const BASE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  id="Defs_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" name="Task 1" />
  </bpmn:process>
</bpmn:definitions>`;

function withDom(fn) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const prevDomParser = globalThis.DOMParser;
  const prevSerializer = globalThis.XMLSerializer;
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.XMLSerializer = dom.window.XMLSerializer;
  try {
    return fn(dom.window);
  } finally {
    globalThis.DOMParser = prevDomParser;
    globalThis.XMLSerializer = prevSerializer;
    dom.window.close();
  }
}

function toMapForTask(rows, listeners = []) {
  return {
    Task_1: {
      properties: {
        extensionProperties: rows,
        extensionListeners: listeners,
      },
      preservedExtensionElements: [],
    },
  };
}

function saveThenExtract(mapRaw, xmlText = BASE_XML) {
  const xmlAfterSave = finalizeCamundaExtensionsXml({
    xmlText,
    camundaExtensionsByElementId: mapRaw,
  });
  const extracted = normalizeCamundaExtensionsMap(extractCamundaExtensionsMapFromBpmnXml(xmlAfterSave));
  return { xmlAfterSave, extracted };
}

function taskStateFromMap(mapRaw) {
  return normalizeCamundaExtensionState(mapRaw?.Task_1);
}

test("single-instance property delete persists after save and reload", () => withDom(() => {
  const beforeRows = [
    { id: "p1", name: "container", value: "Лоток 150x55" },
    { id: "p2", name: "equipment", value: "Весы" },
  ];
  const afterDeleteRows = deleteExtensionPropertyRowsByDeleteAction(beforeRows, "p1");
  const { extracted } = saveThenExtract(toMapForTask(afterDeleteRows));
  const task = taskStateFromMap(extracted);
  assert.deepEqual(
    task.properties.extensionProperties.map((row) => ({ name: row.name, value: row.value })),
    [{ name: "equipment", value: "Весы" }],
  );
}));

test("duplicate-name property delete removes logical key and does not restore after save+reload", () => withDom(() => {
  const beforeRows = [
    { id: "p1", name: "ingredient", value: "salt" },
    { id: "p2", name: "ingredient", value: "pepper" },
    { id: "p3", name: "equipment", value: "pot" },
  ];
  const afterDeleteRows = deleteExtensionPropertyRowsByDeleteAction(beforeRows, "p1");
  const { extracted } = saveThenExtract(toMapForTask(afterDeleteRows));
  const task = taskStateFromMap(extracted);
  assert.equal(
    task.properties.extensionProperties.some((row) => String(row?.name || "").trim() === "ingredient"),
    false,
  );
  const visible = buildVisibleExtensionPropertyRows(task);
  assert.deepEqual(
    visible.rows.map((row) => row.name),
    ["equipment"],
  );
}));

test("repeat save after deletion stays idempotent (no duplicate-key comeback)", () => withDom(() => {
  const beforeRows = [
    { id: "p1", name: "ingredient", value: "salt" },
    { id: "p2", name: "ingredient", value: "pepper" },
    { id: "p3", name: "equipment", value: "pot" },
  ];
  const afterDeleteRows = deleteExtensionPropertyRowsByDeleteAction(beforeRows, "p1");
  const first = saveThenExtract(toMapForTask(afterDeleteRows));
  const second = saveThenExtract(first.extracted, first.xmlAfterSave);
  const task = taskStateFromMap(second.extracted);
  assert.equal(
    task.properties.extensionProperties.some((row) => String(row?.name || "").trim() === "ingredient"),
    false,
  );
  assert.equal(task.properties.extensionProperties.length, 1);
}));

test("reopen hydrate from saved XML does not restore deleted logical key", () => withDom(() => {
  const beforeRows = [
    { id: "p1", name: "ingredient", value: "salt" },
    { id: "p2", name: "ingredient", value: "pepper" },
    { id: "p3", name: "equipment", value: "pot" },
  ];
  const afterDeleteRows = deleteExtensionPropertyRowsByDeleteAction(beforeRows, "p1");
  const { extracted } = saveThenExtract(toMapForTask(afterDeleteRows));
  const reopened = hydrateCamundaExtensionsFromBpmn({
    extractedMap: extracted,
    sessionMetaMap: {},
  });
  const hydrated = normalizeCamundaExtensionsMap(reopened.nextSessionMetaMap);
  const task = taskStateFromMap(hydrated);
  assert.equal(
    task.properties.extensionProperties.some((row) => String(row?.name || "").trim() === "ingredient"),
    false,
  );
}));

test("deleting duplicated property key does not over-delete other categories", () => withDom(() => {
  const beforeRows = [
    { id: "p1", name: "ingredient", value: "salt" },
    { id: "p2", name: "ingredient", value: "pepper" },
    { id: "p3", name: "equipment", value: "pot" },
  ];
  const listeners = [
    { id: "l1", event: "start", type: "class", value: "com.acme.Start" },
  ];
  const afterDeleteRows = deleteExtensionPropertyRowsByDeleteAction(beforeRows, "p2");
  const { extracted } = saveThenExtract(toMapForTask(afterDeleteRows, listeners));
  const task = taskStateFromMap(extracted);
  assert.deepEqual(
    task.properties.extensionProperties.map((row) => row.name),
    ["equipment"],
  );
  assert.deepEqual(
    task.properties.extensionListeners.map((row) => ({ event: row.event, type: row.type, value: row.value })),
    [{ event: "start", type: "class", value: "com.acme.Start" }],
  );
}));

