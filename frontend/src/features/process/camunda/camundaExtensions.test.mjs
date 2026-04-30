import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  addCamundaIoParameterInExtensionState,
  createEmptyCamundaExtensionState,
  extractCamundaInputOutputParametersFromExtensionState,
  extractCamundaExtensionsMapFromBpmnXml,
  finalizeCamundaExtensionsXml,
  hydrateCamundaExtensionsFromBpmn,
  normalizeCamundaExtensionState,
  normalizeCamundaExtensionsMap,
  patchCamundaIoParameterInExtensionState,
  patchCamundaInputParameterInExtensionState,
  removeCamundaIoParameterFromExtensionState,
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

test("import parser treats uppercase camunda:Properties tags as managed properties instead of preserved raw fragments", () => withDom(() => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
    id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
    <bpmn:process id="Process_1" isExecutable="true">
      <bpmn:userTask id="Task_1">
        <bpmn:extensionElements>
          <camunda:Properties>
            <camunda:Property name="priority" value="high" />
          </camunda:Properties>
        </bpmn:extensionElements>
      </bpmn:userTask>
    </bpmn:process>
  </bpmn:definitions>`;
  const extracted = extractCamundaExtensionsMapFromBpmnXml(xml);
  const state = normalizeCamundaExtensionState(extracted.Task_1);
  assert.deepEqual(
    state.properties.extensionProperties.map((item) => ({ name: item.name, value: item.value })),
    [{ name: "priority", value: "high" }],
  );
  assert.deepEqual(state.preservedExtensionElements, []);
}));

test("finalize preserves guarded template-insert managed properties when state map has not caught up", () => withDom(() => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
    id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
    <bpmn:process id="Process_1" isExecutable="true">
      <bpmn:task id="Task_inserted">
        <bpmn:extensionElements>
          <camunda:properties>
            <camunda:property name="AUDIT_PROP_TEXT_1777550880336" value="text-value" />
            <camunda:property name="AUDIT_PROP_ROLE_1777550880336" value="role-value" />
          </camunda:properties>
        </bpmn:extensionElements>
      </bpmn:task>
    </bpmn:process>
  </bpmn:definitions>`;

  const finalized = finalizeCamundaExtensionsXml({
    xmlText: xml,
    camundaExtensionsByElementId: {},
    preserveManagedForElementIds: ["Task_inserted"],
  });

  assert.match(finalized, /AUDIT_PROP_TEXT_1777550880336/);
  assert.match(finalized, /AUDIT_PROP_ROLE_1777550880336/);
  assert.doesNotMatch(finalized, /\[object Object\]/);
}));

test("finalize still removes unguarded managed properties when explicit state is absent", () => withDom(() => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
    id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
    <bpmn:process id="Process_1" isExecutable="true">
      <bpmn:task id="Task_stale">
        <bpmn:extensionElements>
          <camunda:properties>
            <camunda:property name="AUDIT_PROP_TEXT_1777550880336" value="text-value" />
          </camunda:properties>
        </bpmn:extensionElements>
      </bpmn:task>
    </bpmn:process>
  </bpmn:definitions>`;

  const finalized = finalizeCamundaExtensionsXml({
    xmlText: xml,
    camundaExtensionsByElementId: {},
  });

  assert.doesNotMatch(finalized, /AUDIT_PROP_TEXT_1777550880336/);
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

test("hydrateCamundaExtensionsFromBpmn keeps managed session deletions when allowSeedFromBpmn=false", () => withDom(() => {
  const extracted = {
    Task_1: {
      properties: {
        extensionProperties: [
          { id: "prop_xml_1", name: "container", value: "Лоток 150x55" },
        ],
        extensionListeners: [
          { id: "listener_xml_1", event: "start", type: "expression", value: "${onStart}" },
        ],
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
        extensionProperties: [],
        extensionListeners: [],
      },
      preservedExtensionElements: [],
    },
  };

  const hydrated = hydrateCamundaExtensionsFromBpmn({
    extractedMap: extracted,
    sessionMetaMap: session,
    allowSeedFromBpmn: false,
  });
  const nextMap = normalizeCamundaExtensionsMap(hydrated.nextSessionMetaMap);
  assert.equal(hydrated.adoptedFromBpmn, false);
  assert.equal(hydrated.source, "session_wins");
  assert.deepEqual(Object.keys(nextMap), []);
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

test("extractCamundaInputOutputParametersFromExtensionState reads text/empty/script parameter shapes", () => withDom(() => {
  const state = normalizeCamundaExtensionState({
    properties: {
      extensionProperties: [],
      extensionListeners: [],
    },
    preservedExtensionElements: [
      `<camunda:connector xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <camunda:inputOutput>
          <camunda:inputParameter name="url">http://192.168.56.101:80/brickpi/sensor/color/value</camunda:inputParameter>
          <camunda:inputParameter name="method">GET</camunda:inputParameter>
          <camunda:inputParameter name="payload"/>
          <camunda:outputParameter name="responseGetPieceColor">
            <camunda:script scriptFormat="javascript">connector.getVariable("response");</camunda:script>
          </camunda:outputParameter>
        </camunda:inputOutput>
        <camunda:connectorId>http-connector</camunda:connectorId>
      </camunda:connector>`,
    ],
  });

  const io = extractCamundaInputOutputParametersFromExtensionState(state);
  assert.equal(io.inputRows.length, 3);
  assert.equal(io.outputRows.length, 1);

  const url = io.inputRows.find((row) => row.name === "url");
  const payload = io.inputRows.find((row) => row.name === "payload");
  const output = io.outputRows.find((row) => row.name === "responseGetPieceColor");

  assert.equal(url?.shape, "text");
  assert.equal(url?.value, "http://192.168.56.101:80/brickpi/sensor/color/value");
  assert.equal(payload?.shape, "empty");
  assert.equal(payload?.value, "");
  assert.equal(output?.shape, "script");
  assert.equal(output?.scriptFormat, "javascript");
  assert.equal(output?.value.includes("connector.getVariable"), true);
}));

test("patchCamundaInputParameterInExtensionState updates preserved input parameter and keeps script output", () => withDom(() => {
  const state = normalizeCamundaExtensionState({
    properties: {
      extensionProperties: [],
      extensionListeners: [],
    },
    preservedExtensionElements: [
      `<camunda:connector xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <camunda:inputOutput>
          <camunda:inputParameter name="url">http://old.local/value</camunda:inputParameter>
          <camunda:inputParameter name="payload"/>
          <camunda:outputParameter name="responseGetPieceColor">
            <camunda:script scriptFormat="javascript">connector.getVariable("response");</camunda:script>
          </camunda:outputParameter>
        </camunda:inputOutput>
        <camunda:connectorId>http-connector</camunda:connectorId>
      </camunda:connector>`,
    ],
  });

  const before = extractCamundaInputOutputParametersFromExtensionState(state);
  const urlRef = before.inputRows.find((row) => row.name === "url");
  const payloadRef = before.inputRows.find((row) => row.name === "payload");

  const nextOne = patchCamundaInputParameterInExtensionState({
    extensionStateRaw: state,
    parameterRef: urlRef,
    patch: { value: "http://new.local/value" },
  });
  const nextTwo = patchCamundaInputParameterInExtensionState({
    extensionStateRaw: nextOne,
    parameterRef: payloadRef,
    patch: { value: "{\"color\":\"red\"}", name: "payloadJson" },
  });

  const after = extractCamundaInputOutputParametersFromExtensionState(nextTwo);
  const url = after.inputRows.find((row) => row.name === "url");
  const payload = after.inputRows.find((row) => row.name === "payloadJson");
  const output = after.outputRows.find((row) => row.name === "responseGetPieceColor");

  assert.equal(url?.value, "http://new.local/value");
  assert.equal(payload?.shape, "text");
  assert.equal(payload?.value, "{\"color\":\"red\"}");
  assert.equal(output?.shape, "script");
  assert.equal(output?.value.includes("connector.getVariable(\"response\")"), true);

  const xml = finalizeCamundaExtensionsXml({
    xmlText: BASE_XML,
    camundaExtensionsByElementId: {
      Task_1: nextTwo,
    },
  });
  assert.equal(xml.includes("http://new.local/value"), true);
  assert.equal(xml.includes("payloadJson"), true);
  assert.equal(xml.includes("connector.getVariable(\"response\")"), true);

  const reloadedMap = extractCamundaExtensionsMapFromBpmnXml(xml);
  const reloadedIo = extractCamundaInputOutputParametersFromExtensionState(reloadedMap.Task_1);
  assert.equal(reloadedIo.inputRows.length, 2);
  assert.equal(reloadedIo.outputRows.length, 1);
}));

test("extractCamundaInputOutputParametersFromExtensionState reads row-level showOnTask attribute", () => withDom(() => {
  const state = normalizeCamundaExtensionState({
    properties: {
      extensionProperties: [],
      extensionListeners: [],
    },
    preservedExtensionElements: [
      `<camunda:connector xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:pm="http://processmap.ai/schema/bpmn/1.0">
        <camunda:inputOutput>
          <camunda:inputParameter name="url" pm:showOnTask="true">http://old.local/value</camunda:inputParameter>
          <camunda:outputParameter name="result">ok</camunda:outputParameter>
        </camunda:inputOutput>
        <camunda:connectorId>http-connector</camunda:connectorId>
      </camunda:connector>`,
    ],
  });
  const io = extractCamundaInputOutputParametersFromExtensionState(state);
  const inputUrl = io.inputRows.find((row) => row.name === "url");
  const outputResult = io.outputRows.find((row) => row.name === "result");
  assert.equal(inputUrl?.showOnTask, true);
  assert.equal(outputResult?.showOnTask, false);
}));

test("patchCamundaIoParameterInExtensionState updates output metadata without touching script body", () => withDom(() => {
  const state = normalizeCamundaExtensionState({
    properties: {
      extensionProperties: [],
      extensionListeners: [],
    },
    preservedExtensionElements: [
      `<camunda:connector xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <camunda:inputOutput>
          <camunda:outputParameter name="responseGetPieceColor">
            <camunda:script scriptFormat="javascript">connector.getVariable("response");</camunda:script>
          </camunda:outputParameter>
        </camunda:inputOutput>
      </camunda:connector>`,
    ],
  });
  const before = extractCamundaInputOutputParametersFromExtensionState(state);
  const outputRef = before.outputRows[0];
  const next = patchCamundaIoParameterInExtensionState({
    extensionStateRaw: state,
    parameterRef: outputRef,
    patch: {
      name: "responseColor",
      showOnTask: true,
    },
  });
  const after = extractCamundaInputOutputParametersFromExtensionState(next);
  const renamed = after.outputRows.find((row) => row.name === "responseColor");
  assert.equal(renamed?.shape, "script");
  assert.equal(renamed?.showOnTask, true);
  assert.equal(String(renamed?.value || "").includes("connector.getVariable(\"response\")"), true);

  const xml = finalizeCamundaExtensionsXml({
    xmlText: BASE_XML,
    camundaExtensionsByElementId: {
      Task_1: next,
    },
  });
  assert.equal(xml.includes("responseColor"), true);
  assert.equal(xml.includes("showOnTask=\"true\""), true);
}));

test("add/remove Camunda IO parameter keeps deterministic extraction and persistence", () => withDom(() => {
  const base = normalizeCamundaExtensionState({
    properties: {
      extensionProperties: [],
      extensionListeners: [],
    },
    preservedExtensionElements: [
      `<camunda:connector xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <camunda:inputOutput>
          <camunda:inputParameter name="url">http://old.local/value</camunda:inputParameter>
        </camunda:inputOutput>
      </camunda:connector>`,
    ],
  });
  const withInput = addCamundaIoParameterInExtensionState({
    extensionStateRaw: base,
    direction: "input",
    draft: {
      name: "payload",
      value: "{\"color\":\"red\"}",
      showOnTask: true,
    },
  });
  const withOutput = addCamundaIoParameterInExtensionState({
    extensionStateRaw: withInput,
    direction: "output",
    draft: {
      name: "responseCode",
      value: "200",
      showOnTask: false,
    },
  });
  const extracted = extractCamundaInputOutputParametersFromExtensionState(withOutput);
  const payload = extracted.inputRows.find((row) => row.name === "payload");
  const responseCode = extracted.outputRows.find((row) => row.name === "responseCode");
  assert.equal(payload?.showOnTask, true);
  assert.equal(payload?.value, "{\"color\":\"red\"}");
  assert.equal(responseCode?.value, "200");

  const removed = removeCamundaIoParameterFromExtensionState({
    extensionStateRaw: withOutput,
    parameterRef: responseCode,
  });
  const afterRemove = extractCamundaInputOutputParametersFromExtensionState(removed);
  assert.equal(afterRemove.outputRows.some((row) => row.name === "responseCode"), false);
  assert.equal(afterRemove.inputRows.some((row) => row.name === "payload"), true);

  const xml = finalizeCamundaExtensionsXml({
    xmlText: BASE_XML,
    camundaExtensionsByElementId: {
      Task_1: removed,
    },
  });
  assert.equal(xml.includes("payload"), true);
  assert.equal(xml.includes("responseCode"), false);
  assert.equal(xml.includes("showOnTask=\"true\""), true);
}));

test("empty extension state add input/output creates exactly one row per action", () => withDom(() => {
  const base = createEmptyCamundaExtensionState();
  const withInput = addCamundaIoParameterInExtensionState({
    extensionStateRaw: base,
    direction: "input",
    draft: { name: "a", value: "1" },
  });
  const afterInput = extractCamundaInputOutputParametersFromExtensionState(withInput);
  assert.equal(afterInput.inputRows.length, 1);
  assert.equal(afterInput.outputRows.length, 0);

  const withOutput = addCamundaIoParameterInExtensionState({
    extensionStateRaw: base,
    direction: "output",
    draft: { name: "out", value: "ok" },
  });
  const afterOutput = extractCamundaInputOutputParametersFromExtensionState(withOutput);
  assert.equal(afterOutput.inputRows.length, 0);
  assert.equal(afterOutput.outputRows.length, 1);
}));

test("addCamundaIoParameterInExtensionState adds exactly one input row per action for connector-backed state", () => withDom(() => {
  const base = normalizeCamundaExtensionState({
    properties: {
      extensionProperties: [],
      extensionListeners: [],
    },
    preservedExtensionElements: [
      `<camunda:connector xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <camunda:inputOutput>
          <camunda:inputParameter name="url">http://old.local/value</camunda:inputParameter>
          <camunda:inputParameter name="method">GET</camunda:inputParameter>
          <camunda:outputParameter name="response">ok</camunda:outputParameter>
        </camunda:inputOutput>
        <camunda:connectorId>http-connector</camunda:connectorId>
      </camunda:connector>`,
    ],
  });
  const before = extractCamundaInputOutputParametersFromExtensionState(base);
  const once = addCamundaIoParameterInExtensionState({
    extensionStateRaw: base,
    direction: "input",
    draft: { name: "payload", value: "" },
  });
  const afterOnce = extractCamundaInputOutputParametersFromExtensionState(once);
  assert.equal(afterOnce.inputRows.length, before.inputRows.length + 1);
  assert.equal(afterOnce.outputRows.length, before.outputRows.length);

  const twice = addCamundaIoParameterInExtensionState({
    extensionStateRaw: once,
    direction: "input",
    draft: { name: "payload_2", value: "" },
  });
  const afterTwice = extractCamundaInputOutputParametersFromExtensionState(twice);
  assert.equal(afterTwice.inputRows.length, afterOnce.inputRows.length + 1);
  assert.equal(afterTwice.outputRows.length, afterOnce.outputRows.length);
}));

test("addCamundaIoParameterInExtensionState adds exactly one output row per action for connector-backed state", () => withDom(() => {
  const base = normalizeCamundaExtensionState({
    properties: {
      extensionProperties: [],
      extensionListeners: [],
    },
    preservedExtensionElements: [
      `<camunda:connector xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <camunda:inputOutput>
          <camunda:inputParameter name="url">http://old.local/value</camunda:inputParameter>
          <camunda:outputParameter name="response">ok</camunda:outputParameter>
        </camunda:inputOutput>
        <camunda:connectorId>http-connector</camunda:connectorId>
      </camunda:connector>`,
    ],
  });
  const before = extractCamundaInputOutputParametersFromExtensionState(base);
  const once = addCamundaIoParameterInExtensionState({
    extensionStateRaw: base,
    direction: "output",
    draft: { name: "responseCode", value: "200" },
  });
  const afterOnce = extractCamundaInputOutputParametersFromExtensionState(once);
  assert.equal(afterOnce.outputRows.length, before.outputRows.length + 1);
  assert.equal(afterOnce.inputRows.length, before.inputRows.length);
}));

test("hydrateCamundaExtensionsFromBpmn does not double-count semantically equal preserved connector fragments", () => withDom(() => {
  const sessionMap = {
    Task_1: {
      properties: { extensionProperties: [], extensionListeners: [] },
      preservedExtensionElements: [
        `<camunda:connector xmlns:camunda="http://camunda.org/schema/1.0/bpmn"><camunda:inputOutput><camunda:inputParameter name="url">u</camunda:inputParameter><camunda:outputParameter name="out">o</camunda:outputParameter></camunda:inputOutput><camunda:connectorId>http-connector</camunda:connectorId></camunda:connector>`,
      ],
    },
  };
  const extractedMap = {
    Task_1: {
      properties: { extensionProperties: [], extensionListeners: [] },
      preservedExtensionElements: [
        `<camunda:connector xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
          <camunda:inputOutput>
            <camunda:inputParameter name="url">u</camunda:inputParameter>
            <camunda:outputParameter name="out">o</camunda:outputParameter>
          </camunda:inputOutput>
          <camunda:connectorId>http-connector</camunda:connectorId>
        </camunda:connector>`,
      ],
    },
  };
  const hydrated = hydrateCamundaExtensionsFromBpmn({ extractedMap, sessionMetaMap: sessionMap });
  const state = normalizeCamundaExtensionState(hydrated.nextSessionMetaMap.Task_1);
  assert.equal(hydrated.addedPreserved, 0);
  assert.equal(state.preservedExtensionElements.length, 1);
  const io = extractCamundaInputOutputParametersFromExtensionState(state);
  assert.equal(io.inputRows.length, 1);
  assert.equal(io.outputRows.length, 1);
}));

test("freshly added camunda IO row stays singular after save/reopen hydrate cycle", () => withDom(() => {
  const base = normalizeCamundaExtensionState({
    properties: { extensionProperties: [], extensionListeners: [] },
    preservedExtensionElements: [
      `<camunda:connector xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <camunda:inputOutput>
          <camunda:inputParameter name="url">http://old.local/value</camunda:inputParameter>
        </camunda:inputOutput>
        <camunda:connectorId>http-connector</camunda:connectorId>
      </camunda:connector>`,
    ],
  });
  const withAdded = addCamundaIoParameterInExtensionState({
    extensionStateRaw: base,
    direction: "input",
    draft: { name: "payload", value: "{\"color\":\"red\"}" },
  });
  const beforeRoundTrip = extractCamundaInputOutputParametersFromExtensionState(withAdded);
  assert.equal(beforeRoundTrip.inputRows.length, 2);

  const xml = finalizeCamundaExtensionsXml({
    xmlText: BASE_XML,
    camundaExtensionsByElementId: {
      Task_1: withAdded,
    },
  });
  const extracted = extractCamundaExtensionsMapFromBpmnXml(xml);
  const hydrated = hydrateCamundaExtensionsFromBpmn({
    extractedMap: extracted,
    sessionMetaMap: { Task_1: withAdded },
  });
  const afterRoundTripState = normalizeCamundaExtensionState(hydrated.nextSessionMetaMap.Task_1);
  const afterRoundTrip = extractCamundaInputOutputParametersFromExtensionState(afterRoundTripState);
  assert.equal(afterRoundTrip.inputRows.length, beforeRoundTrip.inputRows.length);
  assert.equal(afterRoundTrip.outputRows.length, beforeRoundTrip.outputRows.length);
  assert.equal(afterRoundTrip.inputRows.filter((row) => row.name === "payload").length, 1);
}));

test("export serializer keeps deterministic extension child ordering: unknown first, managed next, robot meta last", () => withDom(() => {
  const xml = finalizeCamundaExtensionsXml({
    xmlText: `<?xml version="1.0" encoding="UTF-8"?>
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
      xmlns:pm="http://processmap.ai/schema/bpmn/1.0"
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
