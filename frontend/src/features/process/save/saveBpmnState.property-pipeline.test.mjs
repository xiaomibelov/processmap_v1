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
