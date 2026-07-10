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

// True duplicate: same name AND same value. This is the only shape the
// save-time guard collapses (exact name+value, keep-first).
const exactDuplicateXml = `
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="key1" value="a" />
          <camunda:property name="key1" value="a" />
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

test("flushSave deduplicates managed properties before persist", async () => {
  let savedXml = "";
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
    getRuntime: () => makeRuntime(exactDuplicateXml),
    onTrace: (event, payload) => events.push({ event, payload }),
    persistence: {
      saveRaw: async (_sid, xml) => {
        saveCalls += 1;
        savedXml = String(xml || "");
        return { ok: true, status: 200, storedRev: 2 };
      },
    },
  });

  const result = await coordinator.flushSave("manual_save");

  assert.equal(result.ok, true, "save succeeds after dedup");
  assert.equal(saveCalls, 1, "backend persist is called once");
  const matches = savedXml.match(/<camunda:property\b[^>]*name="key1"[^>]*>/g) || [];
  assert.equal(matches.length, 1, "only one key1 property remains");
  const event = events.find((e) => e?.event === "SAVE_DEDUPLICATED_CAMUNDA_PROPERTIES");
  assert.ok(event, "emits deduplication event");
  assert.equal(event?.payload?.sid, "sid_dup");
});

test("persistExplicitXml deduplicates managed properties before persist", async () => {
  let savedXml = "";
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
      saveRaw: async (_sid, xml) => {
        saveCalls += 1;
        savedXml = String(xml || "");
        return { ok: true, status: 200, storedRev: 2 };
      },
    },
  });

  const result = await coordinator.persistExplicitXml(exactDuplicateXml, "explicit_test");

  assert.equal(result.ok, true, "explicit persist succeeds after dedup");
  assert.equal(saveCalls, 1, "backend persist is called once");
  const matches = savedXml.match(/<camunda:property\b[^>]*name="key1"[^>]*>/g) || [];
  assert.equal(matches.length, 1, "only one key1 property remains");
});

test("flushSave preserves multi-value same-name properties (different values)", async () => {
  let savedXml = "";
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
    getSessionId: () => "sid_multi",
    getRuntime: () => makeRuntime(duplicateXml), // key1=a and key1=b (multi-value)
    onTrace: (event, payload) => events.push({ event, payload }),
    persistence: {
      saveRaw: async (_sid, xml) => {
        saveCalls += 1;
        savedXml = String(xml || "");
        return { ok: true, status: 200, storedRev: 2 };
      },
    },
  });

  const result = await coordinator.flushSave("manual_save");

  assert.equal(result.ok, true, "save succeeds");
  assert.equal(saveCalls, 1, "backend persist is called once");
  const matches = savedXml.match(/<camunda:property\b[^>]*name="key1"[^>]*>/g) || [];
  assert.equal(matches.length, 2, "both key1 values are preserved (multi-value)");
  assert.ok(savedXml.includes('value="a"'), "first value kept");
  assert.ok(savedXml.includes('value="b"'), "second value kept");
  const event = events.find((e) => e?.event === "SAVE_DEDUPLICATED_CAMUNDA_PROPERTIES");
  assert.equal(event, undefined, "no dedup event: multi-value is not a duplicate");
});

test("persistExplicitXml preserves multi-value same-name properties (different values)", async () => {
  let savedXml = "";
  let saveCalls = 0;
  const store = createBpmnStore({
    xml: "<bpmn:definitions id='initial'/>",
    rev: 1,
    dirty: true,
    lastSavedRev: 0,
  });
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_explicit_multi",
    getRuntime: () => makeRuntime(cleanXml),
    persistence: {
      saveRaw: async (_sid, xml) => {
        saveCalls += 1;
        savedXml = String(xml || "");
        return { ok: true, status: 200, storedRev: 2 };
      },
    },
  });

  const result = await coordinator.persistExplicitXml(duplicateXml, "explicit_test");

  assert.equal(result.ok, true, "explicit persist succeeds");
  assert.equal(saveCalls, 1, "backend persist is called once");
  const matches = savedXml.match(/<camunda:property\b[^>]*name="key1"[^>]*>/g) || [];
  assert.equal(matches.length, 2, "both key1 values are preserved (multi-value)");
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
