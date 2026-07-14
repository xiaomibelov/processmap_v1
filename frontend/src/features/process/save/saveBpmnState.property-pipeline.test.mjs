import test from "node:test";
import assert from "node:assert/strict";
import { saveBpmnState } from "./saveBpmnState.js";
import { __resetForTests as resetCasVersionTracker, getVersion as getTrackedVersion } from "../../../lib/casVersionTracker.js";

test.beforeEach(() => {
  resetCasVersionTracker();
});

function createFakeApiPut(ok = true, overrides = {}) {
  return async () => ({
    ok,
    status: ok ? 200 : 409,
    diagramStateVersion: 7,
    storedRev: 5,
    ...overrides,
  });
}

function createFakeFlushSave(overrides = {}) {
  return async (reason, opts) => ({
    ok: true,
    diagramStateVersion: 7,
    storedRev: 5,
    xml: "<xml>from-coordinator</xml>",
    ...overrides,
  });
}

test("property save delegates to coordinator and returns the real coordinator XML", async () => {
  const calls = [];
  const onSessionSync = (patch) => calls.push(patch);
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
    nextMeta: { camunda_extensions_by_element_id: {} },
    // Direct XML builders should not be invoked because flushSave is present.
    getModelerXml: async () => { throw new Error("getModelerXml should not be called"); },
    apiGetBpmnXml: async () => { throw new Error("apiGetBpmnXml should not be called"); },
    apiPutBpmnXml: async () => { throw new Error("apiPutBpmnXml should not be called"); },
    flushSave: async (reason, opts) => {
      flushCalls.push({ reason, opts });
      return { ok: true, diagramStateVersion: 7, storedRev: 5, xml: "<xml>from-modeler</xml>" };
    },
    onSessionSync,
  });

  assert.equal(result?.ok, true);
  assert.equal(flushCalls.length, 1, "flushSave was called once");
  const call = flushCalls[0];
  assert.equal(call.reason, "property_update", "reason is property_update");
  assert.ok(!call.opts?.xmlOverride, "no xmlOverride so coordinator uses runtime XML");
  assert.equal(typeof call.opts?.bpmnMeta, "object", "bpmnMeta passed to coordinator");
  assert.equal(call.opts?.sourceAction, "property_update", "sourceAction passed");
  assert.equal(result.nextXml, "<xml>from-modeler</xml>", "result carries real coordinator XML");

  const patch = calls.find((c) => c?._sync_source?.includes("saveBpmnState"));
  assert.ok(patch, "sync patch emitted");
  assert.equal(patch.bpmn_xml?.includes("from-modeler"), true, "patch carries coordinator XML");
  assert.equal(patch._apply_bpmn_xml, false, "does not trigger canvas re-import");
  assert.ok(Number(patch._skip_bpmn_render) > 0, "sets skip render token");
});

test("property save without flushSave returns error", async () => {
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
  assert.match(String(result?.error || ""), /flushSave unavailable for property operation/);
});

test("property save passes add/delete source actions to coordinator", async () => {
  for (const operation of ["property_add", "property_delete"]) {
    const flushCalls = [];
    const result = await saveBpmnState({
      operation,
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
      flushSave: async (reason, opts) => {
        flushCalls.push({ reason, opts });
        return { ok: true, diagramStateVersion: 7, storedRev: 5, xml: `<xml>${operation}</xml>` };
      },
      onSessionSync: () => {},
    });

    assert.equal(result?.ok, true, `${operation} succeeds`);
    assert.equal(flushCalls.length, 1, `${operation} calls flushSave once`);
    assert.equal(flushCalls[0].reason, operation, `${operation} reason preserved`);
    assert.equal(flushCalls[0].opts?.sourceAction, operation, `${operation} sourceAction preserved`);
  }
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

test("session_save uses coordinator when flushSave is available", async () => {
  const flushCalls = [];
  const result = await saveBpmnState({
    operation: "session_save",
    sessionId: "sid-123",
    baseDiagramStateVersion: 6,
    xml: "<xml>session</xml>",
    nextMeta: {},
    apiPutBpmnXml: async () => { throw new Error("apiPutBpmnXml should not be called"); },
    flushSave: async (reason, opts) => {
      flushCalls.push({ reason, opts });
      return { ok: true, diagramStateVersion: 7, storedRev: 5, xml: "<xml>session-flushed</xml>" };
    },
    onSessionSync: () => {},
  });

  assert.equal(result?.ok, true);
  assert.equal(flushCalls.length, 1, "flushSave was called");
  assert.equal(flushCalls[0].reason, "manual_save", "session_save reason mapped to manual_save");
  assert.equal(flushCalls[0].opts?.xmlOverride, "<xml>session</xml>", "session XML passed as override");
});

test("successful save bumps tracked diagram state version", async () => {
  const result = await saveBpmnState({
    operation: "session_save",
    sessionId: "sid-track",
    baseDiagramStateVersion: 6,
    xml: "<xml>track</xml>",
    nextMeta: {},
    apiPutBpmnXml: async (_sid, _xml, opts) => ({
      ok: true,
      status: 200,
      diagramStateVersion: Number(opts.baseDiagramStateVersion) + 1,
      storedRev: 5,
    }),
    onSessionSync: () => {},
  });

  assert.equal(result?.ok, true);
  assert.equal(getTrackedVersion("sid-track"), 7);
});

test("409 conflict rolls back and stores server current version", async () => {
  let remembered = null;
  const result = await saveBpmnState({
    operation: "session_save",
    sessionId: "sid-conflict",
    baseDiagramStateVersion: 6,
    xml: "<xml>conflict</xml>",
    nextMeta: {},
    apiPutBpmnXml: async () => ({
      ok: false,
      status: 409,
      error: "DIAGRAM_STATE_CONFLICT",
      data: {
        detail: {
          code: "DIAGRAM_STATE_CONFLICT",
          server_current_version: 9,
        },
      },
    }),
    rememberDiagramStateVersion: (version) => {
      remembered = version;
    },
    onSessionSync: () => {},
  });

  assert.equal(result?.ok, false);
  assert.equal(result?.conflict, true);
  assert.equal(remembered, 9);
  assert.equal(getTrackedVersion("sid-conflict"), 9);
});

test("non-conflict error rolls back tracked version", async () => {
  await saveBpmnState({
    operation: "session_save",
    sessionId: "sid-rollback",
    baseDiagramStateVersion: 6,
    xml: "<xml>rollback</xml>",
    nextMeta: {},
    apiPutBpmnXml: async () => ({
      ok: true,
      status: 200,
      diagramStateVersion: 7,
      storedRev: 5,
    }),
    onSessionSync: () => {},
  });
  assert.equal(getTrackedVersion("sid-rollback"), 7);

  const failed = await saveBpmnState({
    operation: "session_save",
    sessionId: "sid-rollback",
    baseDiagramStateVersion: 7,
    xml: "<xml>rollback2</xml>",
    nextMeta: {},
    apiPutBpmnXml: async () => ({
      ok: false,
      status: 500,
      error: "server error",
    }),
    onSessionSync: () => {},
  });

  assert.equal(failed?.ok, false);
  assert.equal(getTrackedVersion("sid-rollback"), 7);
});
