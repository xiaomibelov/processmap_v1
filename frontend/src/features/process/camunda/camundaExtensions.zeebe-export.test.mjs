import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  dedupCamundaProperties,
  extractCamundaExtensionsMapFromBpmnXml,
  finalizeCamundaExtensionsXml,
  hasDuplicateCamundaProperties,
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

const BASE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_1" name="Взвешивание" />
  </bpmn:process>
</bpmn:definitions>`;

test("finalize export writes zeebe:property and drops camunda:property from managed blocks", () => withDom(() => {
  const xml = finalizeCamundaExtensionsXml({
    xmlText: BASE_XML,
    camundaExtensionsByElementId: {
      Task_1: {
        properties: {
          extensionProperties: [
            { id: "prop_1", name: "container", value: "Лоток 150x55" },
            { id: "prop_2", name: "equipment", value: "Весы высокоточные" },
          ],
          extensionListeners: [],
        },
        preservedExtensionElements: [],
      },
    },
  });
  assert.equal(xml.includes("<zeebe:properties"), true);
  assert.equal(xml.includes("<zeebe:property name="), true);
  assert.equal(xml.includes("camunda:property"), false);
  assert.equal(xml.includes("camunda:properties"), false);
  assert.equal(xml.includes('xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"'), true);
  assert.equal(xml.includes('modeler:executionPlatform="Camunda Cloud"'), true);
}));

test("finalize anti-dual-block: legacy camunda:properties element ends with zeebe:properties only", () => withDom(() => {
  const legacyXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_1" name="Взвешивание">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="container" value="Лоток 150x55" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>`;
  const extracted = extractCamundaExtensionsMapFromBpmnXml(legacyXml);
  const xml = finalizeCamundaExtensionsXml({
    xmlText: legacyXml,
    camundaExtensionsByElementId: extracted,
  });
  assert.equal(xml.includes("<zeebe:properties"), true);
  assert.equal(xml.includes("camunda:properties"), false);
  assert.equal(xml.includes("camunda:property"), false);
  assert.equal(xml.match(/<zeebe:properties\b/g).length, 1);
}));

test("export -> re-import round-trip keeps properties intact", () => withDom(() => {
  const stateMap = {
    Task_1: {
      properties: {
        extensionProperties: [
          { id: "prop_1", name: "container", value: "Лоток 150x55" },
          { id: "prop_2", name: "equipment", value: "Весы высокоточные" },
        ],
        extensionListeners: [],
      },
      preservedExtensionElements: [],
    },
  };
  const xml = finalizeCamundaExtensionsXml({ xmlText: BASE_XML, camundaExtensionsByElementId: stateMap });
  const reloaded = extractCamundaExtensionsMapFromBpmnXml(xml);
  const rows = (reloaded.Task_1?.properties?.extensionProperties || []).map((item) => ({
    name: item.name,
    value: item.value,
  }));
  assert.deepEqual(rows, [
    { name: "container", value: "Лоток 150x55" },
    { name: "equipment", value: "Весы высокоточные" },
  ]);
}));

test("dedup helpers cover the zeebe namespace", () => withDom(() => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
  id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <zeebe:properties>
          <zeebe:property name="container" value="Лоток 150x55" />
          <zeebe:property name="container" value="Лоток 150x55" />
        </zeebe:properties>
      </bpmn:extensionElements>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>`;
  assert.equal(hasDuplicateCamundaProperties(xml), true);
  const deduped = dedupCamundaProperties(xml);
  assert.equal(deduped.match(/<zeebe:property\b/g).length, 1);
  assert.equal(hasDuplicateCamundaProperties(deduped), false);
  // camunda coverage stays intact
  const camundaXml = xml.replaceAll("zeebe:", "camunda:")
    .replace('xmlns:camunda="http://camunda.org/schema/zeebe/1.0"', 'xmlns:camunda="http://camunda.org/schema/1.0/bpmn"');
  assert.equal(hasDuplicateCamundaProperties(camundaXml), true);
  assert.equal(dedupCamundaProperties(camundaXml).match(/<camunda:property\b/g).length, 1);
}));
