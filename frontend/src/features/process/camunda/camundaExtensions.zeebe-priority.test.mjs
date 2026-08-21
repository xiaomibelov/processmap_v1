import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  detectCamundaNamespaceDivergence,
  extractCamundaExtensionsMapFromBpmnXml,
  hydrateCamundaExtensionsFromBpmn,
} from "./camundaExtensions.js";

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

function propsOf(map, elementId) {
  return (map?.[elementId]?.properties?.extensionProperties || [])
    .map((item) => [item.name, item.value]);
}

function divergentXml(platformAttr = "", extraTask = "") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
  xmlns:ns1="http://camunda.org/schema/modeler/1.0"
  id="Definitions_1" ${platformAttr}>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Activity_1ba1v7n">
      <bpmn:extensionElements>
        <zeebe:properties>
          <zeebe:property name="container_tara" value="Противень" />
          <zeebe:property name="ingredient" value="Готовый полуфабрикат блины" />
        </zeebe:properties>
        <camunda:properties>
          <camunda:property name="container_tara" value="Противень" />
          <camunda:property name="ingredient" value="Готовый полуфабрикат блины" />
          <camunda:property name="tara" value="Шпилька" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    ${extraTask}
  </bpmn:process>
</bpmn:definitions>`;
}

const CAMUNDA_ONLY_TASK = `
    <bpmn:task id="Task_c7_only">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="document" value="Задание на производство" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>`;

test("divergent blocks without marker: zeebe wins, stale camunda preserved raw", () => withDom(() => {
  const map = extractCamundaExtensionsMapFromBpmnXml(divergentXml());
  assert.deepEqual(propsOf(map, "Activity_1ba1v7n"), [
    ["container_tara", "Противень"],
    ["ingredient", "Готовый полуфабрикат блины"],
  ]);
  const preserved = (map.Activity_1ba1v7n.preservedExtensionElements || []).join(" ");
  assert.match(preserved, /tara/);
  assert.match(preserved, /Шпилька/);
}));

test("divergent blocks with executionPlatform=Camunda Cloud: zeebe wins", () => withDom(() => {
  const map = extractCamundaExtensionsMapFromBpmnXml(divergentXml('ns1:executionPlatform="Camunda Cloud"'));
  assert.deepEqual(propsOf(map, "Activity_1ba1v7n"), [
    ["container_tara", "Противень"],
    ["ingredient", "Готовый полуфабрикат блины"],
  ]);
}));

test("divergent blocks with executionPlatform=Camunda Platform: camunda wins", () => withDom(() => {
  const map = extractCamundaExtensionsMapFromBpmnXml(divergentXml('ns1:executionPlatform="Camunda Platform"'));
  assert.deepEqual(propsOf(map, "Activity_1ba1v7n"), [
    ["container_tara", "Противень"],
    ["ingredient", "Готовый полуфабрикат блины"],
    ["tara", "Шпилька"],
  ]);
}));

test("camunda-only element still read as fallback", () => withDom(() => {
  const map = extractCamundaExtensionsMapFromBpmnXml(divergentXml("", CAMUNDA_ONLY_TASK));
  assert.deepEqual(propsOf(map, "Task_c7_only"), [["document", "Задание на производство"]]);
}));

test("zeebe-only element unchanged", () => withDom(() => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_z8">
      <bpmn:extensionElements>
        <zeebe:properties>
          <zeebe:property name="equipment" value="Лопатка" />
        </zeebe:properties>
      </bpmn:extensionElements>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>`;
  const map = extractCamundaExtensionsMapFromBpmnXml(xml);
  assert.deepEqual(propsOf(map, "Task_z8"), [["equipment", "Лопатка"]]);
}));

test("detectCamundaNamespaceDivergence reports only diverging elements", () => withDom(() => {
  const result = detectCamundaNamespaceDivergence(divergentXml("", CAMUNDA_ONLY_TASK));
  assert.equal(result.length, 1);
  assert.equal(result[0].elementId, "Activity_1ba1v7n");
  assert.deepEqual(result[0].camundaOnly, ["tara\u0000Шпилька"]);
  assert.deepEqual(result[0].zeebeOnly, []);
}));

test("hydrate: session meta from the new parser is not overridden by stale extracted data", () => withDom(() => {
  // Stale extracted map = old merged-parser union (includes stale tara=Шпилька).
  const staleExtracted = {
    Activity_1ba1v7n: {
      properties: {
        extensionProperties: [
          { id: "p1", name: "container_tara", value: "Противень" },
          { id: "p2", name: "ingredient", value: "Готовый полуфабрикат блины" },
          { id: "p3", name: "tara", value: "Шпилька" },
        ],
        extensionListeners: [],
      },
      preservedExtensionElements: [],
    },
  };
  // Session meta already re-derived by the new (zeebe-priority) parser.
  const cleanSession = {
    Activity_1ba1v7n: {
      properties: {
        extensionProperties: [
          { id: "p1", name: "container_tara", value: "Противень" },
          { id: "p2", name: "ingredient", value: "Готовый полуфабрикат блины" },
        ],
        extensionListeners: [],
      },
      preservedExtensionElements: [],
    },
  };
  const hydration = hydrateCamundaExtensionsFromBpmn({
    extractedMap: staleExtracted,
    sessionMetaMap: cleanSession,
  });
  assert.deepEqual(propsOf(hydration.nextSessionMetaMap, "Activity_1ba1v7n"), [
    ["container_tara", "Противень"],
    ["ingredient", "Готовый полуфабрикат блины"],
  ]);
}));


test("real Меренга excerpt fixture: zeebe wins, fallback intact", () => withDom(() => {
  const fixtureUrl = new URL(
    "../../../../../backend/tests/fixtures/merenga_camunda_cloud_excerpt.bpmn",
    import.meta.url,
  );
  const xml = readFileSync(fixtureUrl, "utf-8");
  const map = extractCamundaExtensionsMapFromBpmnXml(xml);
  assert.deepEqual(propsOf(map, "Activity_1ba1v7n"), [
    ["container_tara", "Противень"],
    ["ingredient", "Готовый полуфабрикат блины"],
  ]);
  assert.deepEqual(propsOf(map, "Activity_18xixja"), [
    ["container_tara", "Дежа"],
    ["ingredient", "Тесто"],
  ]);
  assert.deepEqual(propsOf(map, "Event_18h1aoo"), [["document", "Задание на производство"]]);
  assert.deepEqual(propsOf(map, "Activity_0wh7wzm"), [
    ["ingredient", "Готовый полуфабрикат блины"],
    ["ingredient", "Крем"],
    ["equipment", "Весы высокоточные"],
  ]);
  const div = detectCamundaNamespaceDivergence(xml);
  assert.deepEqual(div.map((d) => d.elementId), ["Activity_1ba1v7n", "Activity_18xixja"]);
}));