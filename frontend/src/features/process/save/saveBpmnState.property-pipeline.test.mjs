import test from "node:test";
import assert from "node:assert/strict";
import { saveBpmnState } from "./saveBpmnState.js";

function createFakeApiPut(ok = true, overrides = {}) {
  return async () => ({
    ok,
    status: ok ? 200 : 409,
    diagramStateVersion: 7,
    storedRev: 5,
    ...overrides,
  });
}

test("property save uses getModelerXml and keeps bpmn_xml in sync payload", async () => {
  const calls = [];
  const onSessionSync = (patch) => calls.push(patch);

  const result = await saveBpmnState({
    operation: "property_update",
    sessionId: "sid-123",
    elementId: "Task_1",
    baseDiagramStateVersion: 6,
    currentCamundaExtensionsByElementId: {},
    nextCamundaExtensionsByElementId: {
      Task_1: {
        properties: {
          extensionProperties: [{ id: "p1", name: "key", value: "value" }],
          extensionListeners: [],
        },
        preservedExtensionElements: [],
      },
    },
    currentMeta: {},
    nextMeta: { camunda_extensions_by_element_id: {} },
    getModelerXml: async () => "<xml>from-modeler</xml>",
    apiPutBpmnXml: createFakeApiPut(),
    onSessionSync,
  });

  assert.equal(result?.ok, true);
  const patch = calls.find((c) => c?._sync_source?.includes("saveBpmnState"));
  assert.ok(patch, "sync patch emitted");
  assert.equal(patch.bpmn_xml?.includes("from-modeler"), true, "patch carries modeler XML");
  assert.equal(patch._apply_bpmn_xml, false, "does not trigger canvas re-import");
  assert.ok(Number(patch._skip_bpmn_render) > 0, "sets skip render token");
});

test("property save without XML source returns missing-XML error", async () => {
  const result = await saveBpmnState({
    operation: "property_update",
    sessionId: "sid-123",
    elementId: "Task_1",
    baseDiagramStateVersion: 6,
    currentCamundaExtensionsByElementId: {},
    nextCamundaExtensionsByElementId: {
      Task_1: {
        properties: {
          extensionProperties: [{ id: "p1", name: "key", value: "value" }],
          extensionListeners: [],
        },
        preservedExtensionElements: [],
      },
    },
    apiPutBpmnXml: createFakeApiPut(),
  });

  assert.equal(result?.ok, false);
  assert.match(String(result?.error || ""), /Отсутствует BPMN XML/);
});

test("property save falls back to apiGetBpmnXml when modeler snapshot is empty", async () => {
  const putCalls = [];
  const result = await saveBpmnState({
    operation: "property_update",
    sessionId: "sid-123",
    elementId: "Task_1",
    baseDiagramStateVersion: 6,
    currentCamundaExtensionsByElementId: {},
    nextCamundaExtensionsByElementId: {
      Task_1: {
        properties: {
          extensionProperties: [{ id: "p1", name: "key", value: "value" }],
          extensionListeners: [],
        },
        preservedExtensionElements: [],
      },
    },
    currentMeta: {},
    nextMeta: { camunda_extensions_by_element_id: {} },
    getModelerXml: async () => "",
    apiGetBpmnXml: async () => ({ ok: true, xml: "<xml>from-server</xml>" }),
    apiPutBpmnXml: async (sid, xml) => {
      putCalls.push(xml);
      return { ok: true, status: 200, diagramStateVersion: 7, storedRev: 5 };
    },
  });

  assert.equal(result?.ok, true);
  assert.equal(putCalls.length, 1, "PUT was called");
  assert.equal(putCalls[0]?.includes("from-server"), true, "PUT uses server XML fallback");
});

test("session_save is unaffected by property-only skip-render flag", async () => {
  const calls = [];
  const result = await saveBpmnState({
    operation: "session_save",
    sessionId: "sid-123",
    baseDiagramStateVersion: 6,
    xml: "<xml>session</xml>",
    nextMeta: {},
    apiPutBpmnXml: createFakeApiPut(),
    onSessionSync: (patch) => calls.push(patch),
  });

  assert.equal(result?.ok, true);
  const patch = calls.find((c) => c?._sync_source?.includes("saveBpmnState"));
  assert.equal(patch?._apply_bpmn_xml, true, "session save still applies XML");
  assert.equal(patch?._skip_bpmn_render, undefined, "no skip token for session save");
});


test("property save delegates XML serialization to coordinator when flushSave is available", async () => {
  const flushCalls = [];

  const result = await saveBpmnState({
    operation: "property_update",
    sessionId: "sid-123",
    elementId: "Task_1",
    baseDiagramStateVersion: 6,
    currentCamundaExtensionsByElementId: {},
    nextCamundaExtensionsByElementId: {
      Task_1: {
        properties: {
          extensionProperties: [{ id: "p1", name: "key", value: "value" }],
          extensionListeners: [],
        },
        preservedExtensionElements: [],
      },
    },
    currentMeta: {},
    nextMeta: { camunda_extensions_by_element_id: { Task_1: {} } },
    // Direct XML builders should not be invoked because flushSave is present.
    getModelerXml: async () => { throw new Error("getModelerXml should not be called"); },
    apiGetBpmnXml: async () => { throw new Error("apiGetBpmnXml should not be called"); },
    apiPutBpmnXml: async () => { throw new Error("apiPutBpmnXml should not be called"); },
    flushSave: async (reason, opts) => {
      flushCalls.push({ reason, opts });
      return { ok: true, diagramStateVersion: 7, storedRev: 5 };
    },
    onSessionSync: () => {},
  });

  assert.equal(result?.ok, true);
  assert.equal(flushCalls.length, 1, "flushSave was called once");
  const call = flushCalls[0];
  assert.equal(call.reason, "property_update", "reason is property_update");
  assert.ok(!call.opts?.xmlOverride, "no xmlOverride so coordinator uses runtime XML");
  assert.equal(typeof call.opts?.bpmnMeta, "object", "bpmnMeta passed to coordinator");
  assert.equal(call.opts?.sourceAction, "property_update", "sourceAction passed");
});
