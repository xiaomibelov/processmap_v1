import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  extractCamundaExtensionsMapFromBpmnXml,
  finalizeCamundaExtensionsXml,
  hydrateCamundaExtensionsFromBpmn,
  normalizeCamundaExtensionState,
  normalizeCamundaExtensionsMap,
  syncCamundaExtensionsToBpmn,
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

function parseXml(xmlText) {
  const parser = new DOMParser();
  return parser.parseFromString(String(xmlText || ""), "application/xml");
}

function findElementById(doc, elementId) {
  return Array.from(doc.getElementsByTagName("*")).find((node) => (
    String(node.getAttribute?.("id") || "").trim() === String(elementId || "").trim()
  )) || null;
}

function extensionChildren(doc, elementId) {
  const owner = findElementById(doc, elementId);
  const ext = Array.from(owner?.childNodes || []).find((child) => child?.nodeType === 1 && child.localName === "extensionElements") || null;
  return Array.from(ext?.childNodes || []).filter((child) => child?.nodeType === 1);
}

function createMockModeler(elements = []) {
  const registryMap = new Map();
  const all = elements.map((entry) => {
    const id = String(entry?.id || "").trim();
    const bo = entry?.businessObject || { id };
    const el = { id, businessObject: bo };
    registryMap.set(id, el);
    return el;
  });

  const registry = {
    get(id) {
      return registryMap.get(String(id || "").trim()) || null;
    },
    getAll() {
      return all.slice();
    },
  };

  const moddle = {
    create(type, payload = {}) {
      if (type === "bpmn:ExtensionElements") {
        return {
          $type: type,
          values: Array.isArray(payload.values) ? payload.values.slice() : [],
          set(key, value) {
            this[key] = value;
          },
        };
      }
      if (type === "camunda:Properties") {
        return {
          $type: type,
          values: Array.isArray(payload.values) ? payload.values.slice() : [],
          set(key, value) {
            this[key] = value;
          },
        };
      }
      if (type === "camunda:Property") {
        return {
          $type: type,
          name: String(payload.name || ""),
          value: String(payload.value || ""),
          set(key, value) {
            this[key] = value;
          },
        };
      }
      if (type === "camunda:ExecutionListener") {
        return {
          $type: type,
          event: String(payload.event || ""),
          class: String(payload.class || ""),
          expression: String(payload.expression || ""),
          delegateExpression: String(payload.delegateExpression || ""),
          set(key, value) {
            this[key] = value;
          },
        };
      }
      throw new Error(`unexpected type: ${type}`);
    },
  };

  return {
    get(name) {
      if (name === "elementRegistry") return registry;
      if (name === "moddle") return moddle;
      return null;
    },
  };
}

const BASE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Defs_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="Task_1" name="Task 1" />
    <bpmn:task id="Task_2" name="Task 2" />
  </bpmn:process>
</bpmn:definitions>`;

test("import parser reads camunda:properties into internal extensionProperties", () => withDom(() => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
    id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
    <bpmn:process id="Process_1" isExecutable="true">
      <bpmn:task id="Task_1">
        <bpmn:extensionElements>
          <camunda:properties>
            <camunda:property name="container" value="Лоток 150x55" />
            <camunda:property name="equipment" value="Весы высокоточные" />
          </camunda:properties>
        </bpmn:extensionElements>
      </bpmn:task>
    </bpmn:process>
  </bpmn:definitions>`;
  const extracted = extractCamundaExtensionsMapFromBpmnXml(xml);
  const state = normalizeCamundaExtensionState(extracted.Task_1);
  assert.equal(state.properties.extensionProperties.length, 2);
  assert.deepEqual(
    state.properties.extensionProperties.map((item) => ({ name: item.name, value: item.value })),
    [
      { name: "container", value: "Лоток 150x55" },
      { name: "equipment", value: "Весы высокоточные" },
    ],
  );
  assert.equal(state.properties.extensionProperties.every((item) => !Object.prototype.hasOwnProperty.call(item, "xmlId")), true);
}));

test("import parser reads zeebe:properties into internal extensionProperties", () => withDom(() => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
    id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
    <bpmn:process id="Process_1" isExecutable="true">
      <bpmn:task id="Task_1">
        <bpmn:extensionElements>
          <zeebe:properties>
            <zeebe:property name="container" value="Лоток 150x55" />
            <zeebe:property name="equipment" value="Весы высокоточные" />
            <zeebe:property name="value" value="1" />
          </zeebe:properties>
        </bpmn:extensionElements>
      </bpmn:task>
    </bpmn:process>
  </bpmn:definitions>`;
  const extracted = extractCamundaExtensionsMapFromBpmnXml(xml);
  const state = normalizeCamundaExtensionState(extracted.Task_1);
  assert.deepEqual(
    state.properties.extensionProperties.map((item) => ({ name: item.name, value: item.value })),
    [
      { name: "container", value: "Лоток 150x55" },
      { name: "equipment", value: "Весы высокоточные" },
      { name: "value", value: "1" },
    ],
  );
}));

test("import parser reads camunda:executionListener type mapping", () => withDom(() => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
    id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
    <bpmn:process id="Process_1" isExecutable="true">
      <bpmn:task id="Task_1">
        <bpmn:extensionElements>
          <camunda:executionListener event="start" expression="\${notifyStart}" />
          <camunda:executionListener event="end" class="com.acme.DoneListener" />
        </bpmn:extensionElements>
      </bpmn:task>
    </bpmn:process>
  </bpmn:definitions>`;
  const extracted = extractCamundaExtensionsMapFromBpmnXml(xml);
  const state = normalizeCamundaExtensionState(extracted.Task_1);
  assert.deepEqual(
    state.properties.extensionListeners.map((item) => ({
      event: item.event,
      type: item.type,
      value: item.value,
    })),
    [
      { event: "start", type: "expression", value: "${notifyStart}" },
      { event: "end", type: "class", value: "com.acme.DoneListener" },
    ],
  );
}));

test("hydrateCamundaExtensionsFromBpmn merges missing element entries from BPMN when session map is partial", () => withDom(() => {
  const extracted = {
    Task_1: {
      properties: {
        extensionProperties: [
          { id: "prop_xml_1", name: "container", value: "Лоток 150x55" },
        ],
        extensionListeners: [],
      },
      preservedExtensionElements: [],
    },
    Task_2: {
      properties: {
        extensionProperties: [
          { id: "prop_xml_2", name: "equipment", value: "Весы высокоточные" },
        ],
        extensionListeners: [],
      },
      preservedExtensionElements: [],
    },
  };
  const session = {
    Task_1: {
      properties: {
        extensionProperties: [
          { id: "prop_session_1", name: "value", value: "1" },
        ],
        extensionListeners: [],
      },
      preservedExtensionElements: [],
    },
  };

  const hydrated = hydrateCamundaExtensionsFromBpmn({
    extractedMap: extracted,
    sessionMetaMap: session,
  });
  const nextMap = normalizeCamundaExtensionsMap(hydrated.nextSessionMetaMap);
  assert.equal(hydrated.adoptedFromBpmn, true);
  assert.equal(hydrated.source, "session_plus_bpmn_missing");
  assert.equal(nextMap.Task_2.properties.extensionProperties.length, 1);
  assert.deepEqual(
    nextMap.Task_2.properties.extensionProperties.map((item) => ({ name: item.name, value: item.value })),
    [{ name: "equipment", value: "Весы высокоточные" }],
  );
  assert.deepEqual(
    nextMap.Task_1.properties.extensionProperties.map((item) => ({ name: item.name, value: item.value })),
    [
      { name: "value", value: "1" },
      { name: "container", value: "Лоток 150x55" },
    ],
  );
}));

test("hydrateCamundaExtensionsFromBpmn keeps session values and appends missing property keys from BPMN for same element", () => withDom(() => {
  const extracted = {
    Task_1: {
      properties: {
        extensionProperties: [
          { id: "prop_xml_1", name: "ingredient", value: "Шампиньон" },
          { id: "prop_xml_2", name: "equipment", value: "Весы" },
          { id: "prop_xml_3", name: "value", value: "1" },
        ],
        extensionListeners: [],
      },
      preservedExtensionElements: [],
    },
  };
  const session = {
    Task_1: {
      properties: {
        extensionProperties: [
          { id: "prop_session_1", name: "ingredient", value: "Креветки" },
        ],
        extensionListeners: [],
      },
      preservedExtensionElements: [],
    },
  };

  const hydrated = hydrateCamundaExtensionsFromBpmn({
    extractedMap: extracted,
    sessionMetaMap: session,
  });
  const next = normalizeCamundaExtensionState(hydrated.nextSessionMetaMap.Task_1);
  assert.equal(hydrated.adoptedFromBpmn, true);
  assert.deepEqual(
    next.properties.extensionProperties.map((item) => ({ name: item.name, value: item.value })),
    [
      { name: "ingredient", value: "Креветки" },
      { name: "equipment", value: "Весы" },
      { name: "value", value: "1" },
    ],
  );
}));

test("export serializer writes camunda:properties block with name/value only", () => withDom(() => {
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
  const doc = parseXml(xml);
  const children = extensionChildren(doc, "Task_1");
  const propertiesNode = children.find((node) => node.localName === "properties");
  assert.ok(propertiesNode);
  const propertyNodes = Array.from(propertiesNode.childNodes).filter((child) => child?.nodeType === 1);
  assert.equal(propertyNodes.length, 2);
  assert.deepEqual(
    propertyNodes.map((node) => ({
      name: node.getAttribute("name"),
      value: node.getAttribute("value"),
      hasId: node.hasAttribute("id"),
    })),
    [
      { name: "container", value: "Лоток 150x55", hasId: false },
      { name: "equipment", value: "Весы высокоточные", hasId: false },
    ],
  );
}));

test("export serializer writes execution listeners with explicit event and single target attribute", () => withDom(() => {
  const xml = finalizeCamundaExtensionsXml({
    xmlText: BASE_XML,
    camundaExtensionsByElementId: {
      Task_1: {
        properties: {
          extensionProperties: [],
          extensionListeners: [
            { id: "listener_1", event: "start", type: "expression", value: "${notifyStart}" },
            { id: "listener_2", event: "end", type: "class", value: "com.acme.DoneListener" },
          ],
        },
        preservedExtensionElements: [],
      },
    },
  });
  const doc = parseXml(xml);
  const listeners = extensionChildren(doc, "Task_1").filter((node) => node.localName === "executionListener");
  assert.equal(listeners.length, 2);
  assert.deepEqual(
    listeners.map((node) => ({
      event: node.getAttribute("event"),
      class: node.getAttribute("class"),
      expression: node.getAttribute("expression"),
      delegateExpression: node.getAttribute("delegateExpression"),
    })),
    [
      { event: "start", class: null, expression: "${notifyStart}", delegateExpression: null },
      { event: "end", class: "com.acme.DoneListener", expression: null, delegateExpression: null },
    ],
  );
}));

test("export serializer adds camunda namespace on definitions when managed extensions are present", () => withDom(() => {
  const xml = finalizeCamundaExtensionsXml({
    xmlText: BASE_XML,
    camundaExtensionsByElementId: {
      Task_1: {
        properties: {
          extensionProperties: [{ id: "prop_1", name: "container", value: "Лоток 150x55" }],
          extensionListeners: [],
        },
        preservedExtensionElements: [],
      },
    },
  });
  const doc = parseXml(xml);
  assert.equal(doc.documentElement.getAttribute("xmlns:camunda"), "http://camunda.org/schema/1.0/bpmn");
}));

test("empty-state export omits empty extensionElements", () => withDom(() => {
  const xml = finalizeCamundaExtensionsXml({
    xmlText: BASE_XML,
    camundaExtensionsByElementId: {},
  });
  const doc = parseXml(xml);
  assert.equal(extensionChildren(doc, "Task_1").length, 0);
}));

test("BPMN export does not leak presentation flags into extension XML", () => withDom(() => {
  const xml = finalizeCamundaExtensionsXml({
    xmlText: BASE_XML,
    camundaExtensionsByElementId: {
      Task_1: {
        properties: {
          extensionProperties: [{ id: "prop_1", name: "container", value: "Лоток 150x55" }],
          extensionListeners: [],
        },
        presentation: { showPropertiesOverlay: true },
      },
    },
  });
  assert.equal(xml.includes("showPropertiesOverlay"), false);
  assert.equal(xml.includes("show_properties_overlay"), false);
  assert.equal(xml.includes("presentation"), false);
}));

test("unknown extension content survives import and export semantically", () => withDom(() => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
    xmlns:foo="http://example.com/foo"
    id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
    <bpmn:process id="Process_1" isExecutable="true">
      <bpmn:task id="Task_1">
        <bpmn:extensionElements>
          <foo:meta code="x" />
          <camunda:inputOutput>
            <camunda:inputParameter name="a">b</camunda:inputParameter>
          </camunda:inputOutput>
          <camunda:executionListener event="start" expression="\${notifyStart}" />
        </bpmn:extensionElements>
      </bpmn:task>
    </bpmn:process>
  </bpmn:definitions>`;
  const extracted = extractCamundaExtensionsMapFromBpmnXml(xml);
  const roundTripXml = finalizeCamundaExtensionsXml({
    xmlText: BASE_XML,
    camundaExtensionsByElementId: extracted,
  });
  assert.equal(roundTripXml.includes("foo:meta"), true);
  assert.equal(roundTripXml.includes("camunda:inputOutput"), true);
  assert.equal(roundTripXml.includes("camunda:executionListener"), true);
}));

test("export serializer keeps deterministic extension child ordering: unknown first, managed next, robot meta last", () => withDom(() => {
  const xml = finalizeCamundaExtensionsXml({
    xmlText: `<?xml version="1.0" encoding="UTF-8"?>
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
      xmlns:pm="http://foodproc.ai/schema/pm"
      id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
      <bpmn:process id="Process_1" isExecutable="true">
        <bpmn:task id="Task_1">
          <bpmn:extensionElements>
            <pm:RobotMeta version="v1">{"robot_meta_version":"v1"}</pm:RobotMeta>
          </bpmn:extensionElements>
        </bpmn:task>
      </bpmn:process>
    </bpmn:definitions>`,
    camundaExtensionsByElementId: {
      Task_1: {
        properties: {
          extensionProperties: [{ id: "prop_1", name: "container", value: "Лоток 150x55" }],
          extensionListeners: [{ id: "listener_1", event: "start", type: "expression", value: "${notifyStart}" }],
        },
        preservedExtensionElements: [
          '<foo:meta xmlns:foo="http://example.com/foo" code="x"/>',
        ],
      },
    },
  });
  const doc = parseXml(xml);
  const children = extensionChildren(doc, "Task_1");
  assert.deepEqual(
    children.map((node) => `${node.prefix || ""}:${node.localName}`),
    ["foo:meta", "camunda:properties", "camunda:executionListener", "pm:RobotMeta"],
  );
}));

test("zeebe properties are normalized to camunda properties on export", () => withDom(() => {
  const extracted = extractCamundaExtensionsMapFromBpmnXml(`<?xml version="1.0" encoding="UTF-8"?>
  <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
    id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
    <bpmn:process id="Process_1" isExecutable="true">
      <bpmn:task id="Task_1">
        <bpmn:extensionElements>
          <zeebe:properties>
            <zeebe:property name="container" value="Лоток 150x55" />
          </zeebe:properties>
        </bpmn:extensionElements>
      </bpmn:task>
    </bpmn:process>
  </bpmn:definitions>`);
  const xml = finalizeCamundaExtensionsXml({
    xmlText: BASE_XML,
    camundaExtensionsByElementId: extracted,
  });
  assert.equal(xml.includes("camunda:properties"), true);
  assert.equal(xml.includes("camunda:property"), true);
  assert.equal(xml.includes("zeebe:properties"), false);
}));

test("integration: create -> save -> reload round-trip restores properties and listeners", () => withDom(() => {
  const stateMap = {
    Task_1: {
      properties: {
        extensionProperties: [
          { id: "prop_1", name: "container", value: "Лоток 150x55" },
          { id: "prop_2", name: "equipment", value: "Весы высокоточные" },
        ],
        extensionListeners: [
          { id: "listener_1", event: "start", type: "expression", value: "${notifyStart}" },
          { id: "listener_2", event: "end", type: "class", value: "com.acme.DoneListener" },
        ],
      },
      preservedExtensionElements: [],
    },
  };
  const xml = finalizeCamundaExtensionsXml({ xmlText: BASE_XML, camundaExtensionsByElementId: stateMap });
  const reloaded = extractCamundaExtensionsMapFromBpmnXml(xml);
  assert.deepEqual(
    normalizeCamundaExtensionState(reloaded.Task_1).properties.extensionProperties.map((item) => ({ name: item.name, value: item.value })),
    normalizeCamundaExtensionState(stateMap.Task_1).properties.extensionProperties.map((item) => ({ name: item.name, value: item.value })),
  );
  assert.deepEqual(
    normalizeCamundaExtensionState(reloaded.Task_1).properties.extensionListeners.map((item) => ({ event: item.event, type: item.type, value: item.value })),
    normalizeCamundaExtensionState(stateMap.Task_1).properties.extensionListeners.map((item) => ({ event: item.event, type: item.type, value: item.value })),
  );
}));

test("integration: duplicate element keeps semantic data and regenerates editor-only ids on import", () => withDom(() => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
    id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
    <bpmn:process id="Process_1" isExecutable="true">
      <bpmn:task id="Task_1">
        <bpmn:extensionElements>
          <camunda:properties>
            <camunda:property name="container" value="Лоток 150x55" />
          </camunda:properties>
          <camunda:executionListener event="start" expression="\${notifyStart}" />
        </bpmn:extensionElements>
      </bpmn:task>
      <bpmn:task id="Task_2">
        <bpmn:extensionElements>
          <camunda:properties>
            <camunda:property name="container" value="Лоток 150x55" />
          </camunda:properties>
          <camunda:executionListener event="start" expression="\${notifyStart}" />
        </bpmn:extensionElements>
      </bpmn:task>
    </bpmn:process>
  </bpmn:definitions>`;
  const extracted = normalizeCamundaExtensionsMap(extractCamundaExtensionsMapFromBpmnXml(xml));
  assert.equal(extracted.Task_1.properties.extensionProperties[0].id === extracted.Task_2.properties.extensionProperties[0].id, false);
  assert.equal(extracted.Task_1.properties.extensionListeners[0].id === extracted.Task_2.properties.extensionListeners[0].id, false);
  const exported = finalizeCamundaExtensionsXml({ xmlText: BASE_XML, camundaExtensionsByElementId: extracted });
  assert.equal(exported.includes("prop_"), false);
  assert.equal(exported.includes("listener_"), false);
}));

test("integration: deleted element data is not emitted into exported BPMN", () => withDom(() => {
  const exported = finalizeCamundaExtensionsXml({
    xmlText: `<?xml version="1.0" encoding="UTF-8"?>
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
      id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
      <bpmn:process id="Process_1" isExecutable="true">
        <bpmn:task id="Task_2" />
      </bpmn:process>
    </bpmn:definitions>`,
    camundaExtensionsByElementId: {
      Task_1: {
        properties: {
          extensionProperties: [{ id: "prop_1", name: "container", value: "Лоток 150x55" }],
          extensionListeners: [],
        },
        preservedExtensionElements: [],
      },
    },
  });
  assert.equal(exported.includes("Лоток 150x55"), false);
}));

test("syncCamundaExtensionsToBpmn preserves non-managed entries and writes managed camunda nodes", () => {
  const taskBusinessObject = {
    id: "Task_1",
    extensionElements: {
      $type: "bpmn:ExtensionElements",
      values: [{ $type: "pm:RobotMeta", version: "v1", json: "{\"robot_meta_version\":\"v1\"}" }],
      set(key, value) {
        this[key] = value;
      },
    },
    set(key, value) {
      this[key] = value;
    },
  };
  const modeler = createMockModeler([{ id: "Task_1", businessObject: taskBusinessObject }]);
  const res = syncCamundaExtensionsToBpmn({
    modeler,
    camundaExtensionsByElementId: {
      Task_1: {
        properties: {
          extensionProperties: [{ id: "prop_1", name: "container", value: "Лоток 150x55" }],
          extensionListeners: [{ id: "listener_1", event: "start", type: "expression", value: "${notifyStart}" }],
        },
        preservedExtensionElements: [],
      },
    },
  });
  assert.equal(res.ok, true);
  assert.equal(taskBusinessObject.extensionElements.values.filter((entry) => entry.$type === "pm:RobotMeta").length, 1);
  assert.equal(taskBusinessObject.extensionElements.values.filter((entry) => entry.$type === "camunda:Properties").length, 1);
  assert.equal(taskBusinessObject.extensionElements.values.filter((entry) => entry.$type === "camunda:ExecutionListener").length, 1);
});
