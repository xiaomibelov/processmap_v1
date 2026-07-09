import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore from "../store/createBpmnStore.js";
import createBpmnCoordinator from "./createBpmnCoordinator.js";

function makeRuntime(xml) {
  return {
    getStatus: () => ({ ready: true, defs: true, token: 1 }),
    getXml: async () => ({ ok: true, xml, token: 1 }),
  };
}


const cleanXml = `
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="key1" value="a" />
          <camunda:property name="key2" value="b" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>
`;

const duplicateXml = `
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="key1" value="a" />
          <camunda:property name="key1" value="b" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>
`;

test("flushSave persists clean XML without duplicate properties", async () => {
  let saveCalls = 0;
  const store = createBpmnStore({
    xml: "<bpmn:definitions id='initial'/>",
    rev: 1,
    dirty: true,
    lastSavedRev: 0,
  });
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_clean",
    getRuntime: () => makeRuntime(cleanXml),
    persistence: {
      saveRaw: async () => {
        saveCalls += 1;
        return { ok: true, status: 200, storedRev: 2 };
      },
    },
  });

  const result = await coordinator.flushSave("manual_save");

  assert.equal(result.ok, true);
  assert.equal(saveCalls, 1);
});

test("flushSave aborts before persist when duplicate managed properties are detected", async () => {
  let saveCalls = 0;
  const events = [];
  const store = createBpmnStore({
    xml: "<bpmn:definitions id='initial'/>",
    rev: 1,
    dirty: true,
    lastSavedRev: 0,
  });
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_dup",
    getRuntime: () => makeRuntime(duplicateXml),
    onTrace: (event, payload) => events.push({ event, payload }),
    persistence: {
      saveRaw: async () => {
        saveCalls += 1;
        return { ok: true, status: 200, storedRev: 2 };
      },
    },
  });

  const result = await coordinator.flushSave("manual_save");

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "duplicate_camunda_properties");
  assert.equal(saveCalls, 0, "backend persist must not be called");
  const event = events.find((e) => e?.event === "SAVE_ABORTED_DUPLICATE_CAMUNDA_PROPERTIES");
  assert.ok(event, "emits duplicate abort event");
  assert.equal(event?.payload?.sid, "sid_dup");
});

test("persistExplicitXml aborts before persist when duplicate managed properties are detected", async () => {
  let saveCalls = 0;
  const store = createBpmnStore({
    xml: "<bpmn:definitions id='initial'/>",
    rev: 1,
    dirty: true,
    lastSavedRev: 0,
  });
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_explicit_dup",
    getRuntime: () => makeRuntime(cleanXml),
    persistence: {
      saveRaw: async () => {
        saveCalls += 1;
        return { ok: true, status: 200, storedRev: 2 };
      },
    },
  });

  const result = await coordinator.persistExplicitXml(duplicateXml, "explicit_test");

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "duplicate_camunda_properties");
  assert.equal(saveCalls, 0, "backend persist must not be called");
});

test("flushSave skip-unchanged path does not persist duplicate XML already stored", async () => {
  let saveCalls = 0;
  const store = createBpmnStore({
    xml: duplicateXml,
    rev: 3,
    dirty: false,
    lastSavedRev: 3,
  });
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_dup_unchanged",
    getRuntime: () => makeRuntime(duplicateXml),
    persistence: {
      saveRaw: async () => {
        saveCalls += 1;
        return { ok: true, status: 200, storedRev: 4 };
      },
    },
  });

  const result = await coordinator.flushSave("manual_save");

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.unchanged, true);
  assert.equal(saveCalls, 0, "no backend call for unchanged payload");
});
