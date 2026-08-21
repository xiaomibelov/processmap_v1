import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { propertyCrudBoundary } from "../propertyCrudBoundary.js";
import { saveCoordinator } from "../../session/saveCoordinator.js";

const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.DOMParser = jsdom.window.DOMParser;
globalThis.XMLSerializer = jsdom.window.XMLSerializer;

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Activity_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="ee_time" value="10" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:task id="Activity_2" />
  </bpmn:process>
</bpmn:definitions>`;

function createRuntime({ xml = SAMPLE_XML } = {}) {
  const modelerState = {};
  return {
    getSessionId: () => "sess-test-123",
    getCurrentXml: () => xml,
    getCurrentBpmnMeta: () => ({ version: 1 }),
    getBaseDiagramStateVersion: () => 0,
    rememberDiagramStateVersion: () => {},
    getElementCamundaExtensionState: (elementId) => modelerState[elementId] || null,
    applyElementCamundaExtensionsToModeler: (elementId, state) => {
      modelerState[elementId] = JSON.parse(JSON.stringify(state));
      return { ok: true };
    },
    onSessionSync: () => {},
  };
}

function installMockTransport() {
  const calls = [];
  saveCoordinator.registerPipeline("xml", {
    transport: async (sessionId, payload) => {
      calls.push({ sessionId, payload });
      return {
        ok: true,
        status: 200,
        diagram_state_version: 42,
        xml: payload.xml,
      };
    },
    buildPayload: (payload) => payload,
    getBaseVersion: () => 0,
    onSuccess: () => {},
    on409: () => {},
    onError: () => {},
    debounceMs: 0,
    retryCount: 0,
    retryDelayMs: 0,
  });
  return calls;
}

function setup(options = {}) {
  propertyCrudBoundary.reset();
  const calls = installMockTransport();
  propertyCrudBoundary.registerRuntime(createRuntime(options));
  return calls;
}

function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

test("getProperty reads existing camunda property", () => {
  setup();
  const value = propertyCrudBoundary.getProperty("Activity_1", "ee_time");
  assert.equal(value, "10");
});

test("getProperty returns undefined for missing property", () => {
  setup();
  const value = propertyCrudBoundary.getProperty("Activity_1", "missing");
  assert.equal(value, undefined);
});

test("setProperty updates XML and triggers debounced save", async () => {
  const calls = setup();

  const out = await propertyCrudBoundary.setProperty("Activity_1", "ingredient_value", "2.5");
  assert.equal(out.ok, true);
  assert.equal(propertyCrudBoundary.getProperty("Activity_1", "ingredient_value"), "2.5");

  assert.equal(calls.length, 0);

  await wait(400);
  assert.equal(calls.length, 1);
  const savedXml = calls[0].payload.xml;
  assert.ok(savedXml.includes('name="ingredient_value"'));
  assert.ok(savedXml.includes('value="2.5"'));
  assert.ok(savedXml.includes('name="ee_time"'));
});

test("rapid edits are debounced into a single save", async () => {
  const calls = setup();

  await propertyCrudBoundary.setProperty("Activity_1", "a", "1");
  await propertyCrudBoundary.setProperty("Activity_1", "b", "2");
  await propertyCrudBoundary.setProperty("Activity_1", "c", "3");

  await wait(400);
  assert.equal(calls.length, 1);
  const savedXml = calls[0].payload.xml;
  assert.ok(savedXml.includes('name="a"'));
  assert.ok(savedXml.includes('name="b"'));
  assert.ok(savedXml.includes('name="c"'));
});

test("deleteProperty removes property and serializes updated XML", async () => {
  const calls = setup();

  const out = await propertyCrudBoundary.deleteProperty("Activity_1", "ee_time");
  assert.equal(out.ok, true);
  assert.equal(propertyCrudBoundary.getProperty("Activity_1", "ee_time"), undefined);

  await wait(400);
  assert.equal(calls.length, 1);
  const savedXml = calls[0].payload.xml;
  assert.ok(!savedXml.includes('name="ee_time"'));
});

test("setProperties on new element creates extensionElements block", async () => {
  const calls = setup();

  await propertyCrudBoundary.setProperties("Activity_2", { ee_time: "5", ingredient_value: "1" });

  await wait(400);
  assert.equal(calls.length, 1);
  const savedXml = calls[0].payload.xml;
  assert.ok(savedXml.includes('id="Activity_2"'));
  assert.ok(savedXml.includes('name="ee_time"'));
  assert.ok(savedXml.includes('name="ingredient_value"'));
});

test("subscribers receive element and global notifications", async () => {
  setup();

  const elementEvents = [];
  const globalEvents = [];
  propertyCrudBoundary.subscribe("Activity_1", (e) => elementEvents.push(e));
  propertyCrudBoundary.subscribe(null, (e) => globalEvents.push(e));

  await propertyCrudBoundary.setProperty("Activity_1", "ee_time", "99");

  assert.equal(elementEvents.length, 1);
  assert.equal(elementEvents[0].type, "properties");
  assert.deepEqual(elementEvents[0].keys, ["ee_time"]);

  assert.equal(globalEvents.length, 1);
  assert.equal(globalEvents[0].elementId, "Activity_1");
});

test("modeler apply failure returns error and does not schedule save", async () => {
  propertyCrudBoundary.reset();
  installMockTransport();
  propertyCrudBoundary.registerRuntime({
    ...createRuntime(),
    applyElementCamundaExtensionsToModeler: () => ({ ok: false, error: "modeler_busy" }),
  });

  const out = await propertyCrudBoundary.setProperty("Activity_1", "x", "1");
  assert.equal(out.ok, false);
  assert.equal(out.error, "modeler_busy");

  await wait(400);
  assert.equal(out.ok, false);
});
