import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCamundaExtensionsCanonicalXml,
  persistCamundaExtensionsViaCanonicalXmlBoundary,
} from "./camundaExtensionsSaveBoundary.js";

const BASE_XML = "<bpmn:definitions id=\"Defs_1\"><bpmn:process id=\"Process_1\"><bpmn:task id=\"Task_1\" /></bpmn:process></bpmn:definitions>";

const NEXT_META = {
  version: 1,
  camunda_extensions_by_element_id: {
    Task_1: {
      properties: {
        extensionProperties: [
          { id: "p1", name: "ingredient", value: "salt" },
        ],
        extensionListeners: [],
      },
      preservedExtensionElements: [],
    },
  },
};

const CURRENT_XML = "<xml>current</xml>";
const NEXT_XML = "<xml>next</xml>";

function createRef(initial = null) {
  return { current: initial };
}

function buildStub(options = {}) {
  const stub = {
    putCalls: [],
    patchCalls: [],
    getCalls: [],
    syncs: [],
    acks: [],
    putResult: options.putResult ?? { ok: true, status: 200, storedRev: 2, diagramStateVersion: 5 },
    patchResult: options.patchResult ?? { ok: true, status: 200, session: { bpmn_xml_version: 2, diagram_state_version: 5 } },
    getResults: options.getResults ?? [],
    getIndex: 0,
    async apiPutBpmnXml(sessionId, xml, opts) {
      stub.putCalls.push({ sessionId, xml, opts });
      const result = typeof stub.putResult === "function" ? stub.putResult(stub.putCalls.length) : stub.putResult;
      return result;
    },
    async apiPatchSessionMeta(sessionId, patch) {
      stub.patchCalls.push({ sessionId, patch });
      const result = typeof stub.patchResult === "function" ? stub.patchResult(stub.patchCalls.length) : stub.patchResult;
      return result;
    },
    async apiGetSession(sessionId) {
      stub.getCalls.push({ sessionId });
      const result = stub.getResults[stub.getIndex] ?? { ok: false };
      stub.getIndex += 1;
      return result;
    },
    onSessionSync(session) { stub.syncs.push(session); },
    onDurableSaveAck(ack) { stub.acks.push(ack); },
    buildCanonicalXml({ xmlText, camundaExtensionsByElementId }) {
      return xmlText === CURRENT_XML ? NEXT_XML : `<xml>${JSON.stringify(camundaExtensionsByElementId)}</xml>`;
    },
  };
  return stub;
}

test("buildCamundaExtensionsCanonicalXml mutates canonical BPMN XML through provided boundary builder", () => {
  const out = buildCamundaExtensionsCanonicalXml({
    currentXmlRaw: BASE_XML,
    nextCamundaExtensionsByElementIdRaw: NEXT_META.camunda_extensions_by_element_id,
    buildCanonicalXml: ({ xmlText, camundaExtensionsByElementId }) => (
      `${xmlText}<!--camunda:${Object.keys(camundaExtensionsByElementId).join(",")}-->`
    ),
  });
  assert.notEqual(out.nextXml, BASE_XML);
  assert.equal(out.nextXml.includes("camunda:Task_1"), true);
});

test("persistCamundaExtensionsViaCanonicalXmlBoundary uses canonical PUT path and syncs from fresh session", async () => {
  const syncCalls = [];
  const putCalls = [];
  const getCalls = [];
  const out = await persistCamundaExtensionsViaCanonicalXmlBoundary({
    sessionIdRaw: "sess_1",
    isLocal: false,
    currentXmlRaw: BASE_XML,
    nextMetaRaw: NEXT_META,
    nextCamundaExtensionsByElementIdRaw: NEXT_META.camunda_extensions_by_element_id,
    baseDiagramStateVersionRaw: 7,
    buildCanonicalXml: ({ xmlText }) => `${xmlText}<!--changed-->`,
    apiPutBpmnXml: async (sid, xml, options) => {
      putCalls.push({ sid, xml, options });
      return { ok: true, status: 200, storedRev: 5, diagramStateVersion: 8 };
    },
    apiGetSession: async (sid) => {
      getCalls.push(sid);
      return { ok: true, session: { id: sid, session_id: sid, bpmn_xml: "<server-xml/>", bpmn_meta: NEXT_META } };
    },
    onSessionSync: (payload) => {
      syncCalls.push(payload);
    },
  });

  assert.equal(out.ok, true);
  assert.equal(putCalls.length, 1);
  assert.equal(getCalls.length, 1);
  assert.equal(putCalls[0].sid, "sess_1");
  assert.equal(putCalls[0].options.baseDiagramStateVersion, 7);
  assert.equal(putCalls[0].options.reason, "manual_save:camunda_extensions");
  assert.equal(putCalls[0].options.bpmnMeta.camunda_extensions_by_element_id.Task_1.properties.extensionProperties[0].name, "ingredient");
  assert.equal(syncCalls.length, 1);
  assert.equal(syncCalls[0]._sync_source, "camunda_extensions_xml_boundary_save");
});

test("persistCamundaExtensionsViaCanonicalXmlBoundary can acknowledge durable PUT before slow background session refresh", async () => {
  const syncCalls = [];
  const events = [];
  let resolveRefresh;
  const refreshGate = new Promise((resolve) => {
    resolveRefresh = resolve;
  });

  const out = await persistCamundaExtensionsViaCanonicalXmlBoundary({
    sessionIdRaw: "sess_bg",
    isLocal: false,
    currentXmlRaw: BASE_XML,
    nextMetaRaw: NEXT_META,
    nextCamundaExtensionsByElementIdRaw: NEXT_META.camunda_extensions_by_element_id,
    baseDiagramStateVersionRaw: 7,
    buildCanonicalXml: ({ xmlText }) => `${xmlText}<!--changed-->`,
    apiPutBpmnXml: async () => {
      events.push("put");
      return { ok: true, status: 200, storedRev: 5, diagramStateVersion: 8 };
    },
    apiGetSession: async (sid) => {
      events.push("refresh-start");
      await refreshGate;
      events.push("refresh-resolve");
      return { ok: true, session: { id: sid, session_id: sid, bpmn_xml: "<server-xml/>", bpmn_meta: NEXT_META } };
    },
    onSessionSync: (payload) => {
      syncCalls.push(payload);
    },
    backgroundSessionRefresh: true,
    onDurableSaveAck: (payload) => {
      events.push(`durable:${payload.diagramStateVersion}`);
    },
    onBackgroundSessionSyncStart: () => {
      events.push("background-start");
    },
    onBackgroundSessionSyncComplete: () => {
      events.push("background-complete");
    },
  });

  assert.equal(out.ok, true);
  assert.equal(out.diagramStateVersion, 8);
  assert.equal(out.backgroundSessionRefresh, true);
  assert.equal(events.includes("durable:8"), true);
  assert.equal(events.includes("background-start"), true);
  assert.equal(events.includes("background-complete"), false);
  assert.equal(syncCalls.length, 1);
  assert.equal(syncCalls[0].bpmn_xml.includes("<!--changed-->"), true);
  assert.equal(syncCalls[0].diagram_state_version, 8);

  resolveRefresh();
  const backgroundOut = await out.backgroundSessionSyncPromise;
  assert.equal(backgroundOut.ok, true);
  assert.equal(events.includes("background-complete"), true);
  assert.equal(syncCalls.length, 2);
  assert.equal(syncCalls[1].bpmn_xml, "<server-xml/>");
});

test("persistCamundaExtensionsViaCanonicalXmlBoundary keeps durable success when background refresh fails", async () => {
  const events = [];
  const out = await persistCamundaExtensionsViaCanonicalXmlBoundary({
    sessionIdRaw: "sess_bg_fail",
    isLocal: false,
    currentXmlRaw: BASE_XML,
    nextMetaRaw: NEXT_META,
    nextCamundaExtensionsByElementIdRaw: NEXT_META.camunda_extensions_by_element_id,
    baseDiagramStateVersionRaw: 3,
    buildCanonicalXml: ({ xmlText }) => `${xmlText}<!--changed-->`,
    apiPutBpmnXml: async () => ({ ok: true, status: 200, storedRev: 4, diagramStateVersion: 5 }),
    apiGetSession: async () => ({ ok: false, status: 500, error: "boom" }),
    onSessionSync: () => {},
    backgroundSessionRefresh: true,
    onDurableSaveAck: () => {
      events.push("durable");
    },
    onBackgroundSessionSyncError: (payload) => {
      events.push(`background-error:${payload.status}`);
    },
  });

  assert.equal(out.ok, true);
  assert.equal(events.includes("durable"), true);
  const backgroundOut = await out.backgroundSessionSyncPromise;
  assert.equal(backgroundOut.ok, false);
  assert.equal(backgroundOut.status, 500);
  assert.equal(events.includes("background-error:500"), true);
});

test("persistCamundaExtensionsViaCanonicalXmlBoundary does not acknowledge durable save when PUT fails", async () => {
  const events = [];
  const out = await persistCamundaExtensionsViaCanonicalXmlBoundary({
    sessionIdRaw: "sess_put_fail",
    isLocal: false,
    currentXmlRaw: BASE_XML,
    nextMetaRaw: NEXT_META,
    nextCamundaExtensionsByElementIdRaw: NEXT_META.camunda_extensions_by_element_id,
    baseDiagramStateVersionRaw: 3,
    buildCanonicalXml: ({ xmlText }) => `${xmlText}<!--changed-->`,
    apiPutBpmnXml: async () => ({ ok: false, status: 500, error: "boom" }),
    apiGetSession: async () => ({ ok: true, session: {} }),
    backgroundSessionRefresh: true,
    onDurableSaveAck: () => {
      events.push("durable");
    },
  });

  assert.equal(out.ok, false);
  assert.equal(out.status, 500);
  assert.deepEqual(events, []);
});

test("persistCamundaExtensionsViaCanonicalXmlBoundary falls back to canonical XML session patch when refetch is unavailable", async () => {
  const syncCalls = [];
  const out = await persistCamundaExtensionsViaCanonicalXmlBoundary({
    sessionIdRaw: "sess_2",
    isLocal: false,
    currentXmlRaw: BASE_XML,
    nextMetaRaw: NEXT_META,
    nextCamundaExtensionsByElementIdRaw: NEXT_META.camunda_extensions_by_element_id,
    baseDiagramStateVersionRaw: 11,
    buildCanonicalXml: ({ xmlText }) => `${xmlText}<!--changed-->`,
    apiPutBpmnXml: async () => ({ ok: true, status: 200, storedRev: 12, diagramStateVersion: 13 }),
    apiGetSession: async () => ({ ok: false, status: 500, error: "boom" }),
    onSessionSync: (payload) => {
      syncCalls.push(payload);
    },
  });

  assert.equal(out.ok, true);
  assert.equal(syncCalls.length, 1);
  assert.equal(syncCalls[0].session_id, "sess_2");
  assert.equal(typeof syncCalls[0].bpmn_xml, "string");
  assert.equal(syncCalls[0].bpmn_xml.includes("<!--changed-->"), true);
  assert.equal(syncCalls[0].diagram_state_version, 13);
  assert.equal(syncCalls[0].bpmn_xml_version, 12);
});

test("persistCamundaExtensionsViaCanonicalXmlBoundary does not write metadata-only fallback when XML did not change", async () => {
  const putCalls = [];
  const syncCalls = [];
  const out = await persistCamundaExtensionsViaCanonicalXmlBoundary({
    sessionIdRaw: "sess_3",
    isLocal: false,
    currentXmlRaw: BASE_XML,
    nextMetaRaw: NEXT_META,
    nextCamundaExtensionsByElementIdRaw: {},
    baseDiagramStateVersionRaw: 4,
    buildCanonicalXml: ({ xmlText }) => xmlText,
    apiPutBpmnXml: async (...args) => {
      putCalls.push(args);
      return { ok: true };
    },
    apiGetSession: async () => ({ ok: true, session: {} }),
    onSessionSync: (payload) => {
      syncCalls.push(payload);
    },
  });

  assert.equal(out.ok, false);
  assert.equal(String(out.error || "").includes("не применились"), true);
  assert.equal(putCalls.length, 0);
  assert.equal(syncCalls.length, 0);
});

test("persistCamundaExtensionsViaCanonicalXmlBoundary retries once on diagram-state conflict with fresh base version", async () => {
  const putCalls = [];
  const getCalls = [];
  const syncCalls = [];
  let putAttempt = 0;
  const durableAcks = [];

  const out = await persistCamundaExtensionsViaCanonicalXmlBoundary({
    sessionIdRaw: "sess_conflict",
    isLocal: false,
    currentXmlRaw: BASE_XML,
    nextMetaRaw: NEXT_META,
    nextCamundaExtensionsByElementIdRaw: NEXT_META.camunda_extensions_by_element_id,
    baseDiagramStateVersionRaw: 5,
    buildCanonicalXml: ({ xmlText }) => `${xmlText}<!--changed-->`,
    apiPutBpmnXml: async (sid, xml, options) => {
      putAttempt += 1;
      putCalls.push({ sid, xml, options });
      if (putAttempt === 1) {
        return {
          ok: false,
          status: 409,
          error: "DIAGRAM_STATE_CONFLICT",
        };
      }
      return {
        ok: true,
        status: 200,
        storedRev: 11,
        diagramStateVersion: 12,
      };
    },
    apiGetSession: async (sid) => {
      getCalls.push(sid);
      return {
        ok: true,
        session: {
          id: sid,
          session_id: sid,
          bpmn_xml: "<server-xml/>",
          bpmn_meta: { version: 2, flow_meta: { Flow_1: { tier: "P1" } } },
          diagram_state_version: 9,
          bpmn_xml_version: 9,
          version: 9,
        },
      };
    },
    onSessionSync: (payload) => {
      syncCalls.push(payload);
    },
    onDurableSaveAck: (payload) => {
      durableAcks.push(payload);
    },
  });

  assert.equal(out.ok, true);
  assert.equal(putCalls.length, 2);
  assert.equal(putCalls[0].options.baseDiagramStateVersion, 5);
  assert.equal(putCalls[1].options.baseDiagramStateVersion, 9);
  assert.equal(putCalls[1].options.reason, "manual_save:camunda_extensions");
  assert.equal(putCalls[1].options.bpmnMeta.flow_meta.Flow_1.tier, "P1");
  assert.equal(getCalls.length >= 2, true);
  assert.equal(syncCalls.length, 1);
  assert.equal(durableAcks.length, 1);
  assert.equal(durableAcks[0].diagramStateVersion, 12);
});

test("persistCamundaExtensionsViaCanonicalXmlBoundary does not acknowledge durable save when conflict retry cannot persist", async () => {
  const durableAcks = [];
  const out = await persistCamundaExtensionsViaCanonicalXmlBoundary({
    sessionIdRaw: "sess_conflict_fail",
    isLocal: false,
    currentXmlRaw: BASE_XML,
    nextMetaRaw: NEXT_META,
    nextCamundaExtensionsByElementIdRaw: NEXT_META.camunda_extensions_by_element_id,
    baseDiagramStateVersionRaw: 5,
    buildCanonicalXml: ({ xmlText }) => `${xmlText}<!--changed-->`,
    apiPutBpmnXml: async () => ({
      ok: false,
      status: 409,
      error: "DIAGRAM_STATE_CONFLICT",
    }),
    apiGetSession: async (sid) => ({
      ok: true,
      session: {
        id: sid,
        session_id: sid,
        bpmn_xml: "<server-xml/>",
        bpmn_meta: NEXT_META,
        diagram_state_version: 9,
      },
    }),
    onDurableSaveAck: (payload) => {
      durableAcks.push(payload);
    },
  });

  assert.equal(out.ok, false);
  assert.equal(out.status, 409);
  assert.equal(durableAcks.length, 0);
});


test("meta-only save uses PATCH when XML unchanged, meta changed, and apiPatchSessionMeta is available", async () => {
  const stub = buildStub();
  const ref = createRef(4);
  const currentMeta = { version: 1, camunda_extensions_by_element_id: {} };
  const nextMeta = { ...NEXT_META };

  const result = await persistCamundaExtensionsViaCanonicalXmlBoundary({
    sessionIdRaw: "sess_1",
    isLocal: false,
    currentXmlRaw: CURRENT_XML,
    currentMetaRaw: currentMeta,
    nextMetaRaw: nextMeta,
    nextCamundaExtensionsByElementIdRaw: NEXT_META.camunda_extensions_by_element_id,
    baseDiagramStateVersionRaw: 4,
    lastServerDiagramStateVersionRef: ref,
    buildCanonicalXml: ({ xmlText }) => xmlText,
    apiPutBpmnXml: stub.apiPutBpmnXml,
    apiPatchSessionMeta: stub.apiPatchSessionMeta,
    apiGetSession: stub.apiGetSession,
    onSessionSync: stub.onSessionSync,
    onDurableSaveAck: stub.onDurableSaveAck,
  });

  assert.equal(result.ok, true);
  assert.equal(stub.putCalls.length, 0);
  assert.equal(stub.patchCalls.length, 1);
  assert.equal(stub.patchCalls[0].patch.base_diagram_state_version, 4);
  assert.equal(ref.current, 5);
  assert.equal(stub.acks.length, 1);
  assert.equal(stub.syncs.length, 1);
});

test("meta-only save skips when XML and meta unchanged", async () => {
  const stub = buildStub();
  const ref = createRef(4);
  const meta = { version: 1, camunda_extensions_by_element_id: NEXT_META.camunda_extensions_by_element_id };

  const result = await persistCamundaExtensionsViaCanonicalXmlBoundary({
    sessionIdRaw: "sess_1",
    isLocal: false,
    currentXmlRaw: CURRENT_XML,
    currentMetaRaw: meta,
    nextMetaRaw: meta,
    nextCamundaExtensionsByElementIdRaw: NEXT_META.camunda_extensions_by_element_id,
    baseDiagramStateVersionRaw: 4,
    lastServerDiagramStateVersionRef: ref,
    buildCanonicalXml: ({ xmlText }) => xmlText,
    apiPutBpmnXml: stub.apiPutBpmnXml,
    apiPatchSessionMeta: stub.apiPatchSessionMeta,
    onSessionSync: stub.onSessionSync,
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(stub.putCalls.length, 0);
  assert.equal(stub.patchCalls.length, 0);
});

test("meta-only save retries on 409 and updates lastServerDiagramStateVersionRef", async () => {
  const stub = buildStub();
  let calls = 0;
  stub.patchResult = (n) => {
    calls += 1;
    if (n === 1) {
      return { ok: false, status: 409, error: "DIAGRAM_STATE_CONFLICT", data: { detail: { server_current_version: 7 } } };
    }
    return { ok: true, status: 200, session: { bpmn_xml_version: 3, diagram_state_version: 8 } };
  };
  stub.getResults = [{ ok: true, session: { bpmn_xml: CURRENT_XML, bpmn_meta: { version: 2 }, diagram_state_version: 7 } }];

  const ref = createRef(4);
  const currentMeta = { version: 1, camunda_extensions_by_element_id: {} };

  const result = await persistCamundaExtensionsViaCanonicalXmlBoundary({
    sessionIdRaw: "sess_1",
    isLocal: false,
    currentXmlRaw: CURRENT_XML,
    currentMetaRaw: currentMeta,
    nextMetaRaw: NEXT_META,
    nextCamundaExtensionsByElementIdRaw: NEXT_META.camunda_extensions_by_element_id,
    baseDiagramStateVersionRaw: 4,
    lastServerDiagramStateVersionRef: ref,
    buildCanonicalXml: ({ xmlText }) => xmlText,
    apiPutBpmnXml: stub.apiPutBpmnXml,
    apiPatchSessionMeta: stub.apiPatchSessionMeta,
    apiGetSession: stub.apiGetSession,
    onSessionSync: stub.onSessionSync,
  });

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(stub.patchCalls.length, 2);
  assert.equal(stub.patchCalls[1].patch.base_diagram_state_version, 7);
  assert.equal(stub.getCalls.length, 1);
  assert.equal(ref.current, 8);
});

test("XML-changed save uses PUT and updates lastServerDiagramStateVersionRef", async () => {
  const stub = buildStub();
  const ref = createRef(4);
  const currentMeta = { version: 1, camunda_extensions_by_element_id: {} };

  const result = await persistCamundaExtensionsViaCanonicalXmlBoundary({
    sessionIdRaw: "sess_1",
    isLocal: false,
    currentXmlRaw: CURRENT_XML,
    currentMetaRaw: currentMeta,
    nextMetaRaw: NEXT_META,
    nextCamundaExtensionsByElementIdRaw: NEXT_META.camunda_extensions_by_element_id,
    baseDiagramStateVersionRaw: 4,
    lastServerDiagramStateVersionRef: ref,
    buildCanonicalXml: stub.buildCanonicalXml,
    apiPutBpmnXml: stub.apiPutBpmnXml,
    apiPatchSessionMeta: stub.apiPatchSessionMeta,
    apiGetSession: stub.apiGetSession,
    onSessionSync: stub.onSessionSync,
    onDurableSaveAck: stub.onDurableSaveAck,
  });

  assert.equal(result.ok, true);
  assert.equal(stub.putCalls.length, 1);
  assert.equal(stub.patchCalls.length, 0);
  assert.equal(stub.putCalls[0].opts.baseDiagramStateVersion, 4);
  assert.equal(ref.current, 5);
  assert.equal(stub.acks.length, 1);
});

test("XML-changed save retries on 409 by rebasing from apiGetSession", async () => {
  const stub = buildStub();
  let calls = 0;
  stub.putResult = (n) => {
    calls += 1;
    if (n === 1) {
      return { ok: false, status: 409, error: "DIAGRAM_STATE_CONFLICT", data: { detail: { server_current_version: 7 } } };
    }
    return { ok: true, status: 200, storedRev: 4, diagramStateVersion: 9 };
  };
  stub.getResults = [{ ok: true, session: { bpmn_xml: "<xml>server</xml>", bpmn_meta: { version: 2 }, diagram_state_version: 7 } }];

  const ref = createRef(4);
  const currentMeta = { version: 1, camunda_extensions_by_element_id: {} };

  const result = await persistCamundaExtensionsViaCanonicalXmlBoundary({
    sessionIdRaw: "sess_1",
    isLocal: false,
    currentXmlRaw: CURRENT_XML,
    currentMetaRaw: currentMeta,
    nextMetaRaw: NEXT_META,
    nextCamundaExtensionsByElementIdRaw: NEXT_META.camunda_extensions_by_element_id,
    baseDiagramStateVersionRaw: 4,
    lastServerDiagramStateVersionRef: ref,
    buildCanonicalXml: ({ xmlText, camundaExtensionsByElementId }) => `${xmlText}:${Object.keys(camundaExtensionsByElementId).length}`,
    apiPutBpmnXml: stub.apiPutBpmnXml,
    apiPatchSessionMeta: stub.apiPatchSessionMeta,
    apiGetSession: stub.apiGetSession,
    onSessionSync: stub.onSessionSync,
    onDurableSaveAck: stub.onDurableSaveAck,
  });

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(stub.putCalls.length, 2);
  assert.equal(stub.putCalls[1].xml, "<xml>server</xml>:1");
  assert.equal(stub.putCalls[1].opts.baseDiagramStateVersion, 7);
  assert.equal(ref.current, 9);
});

test("meta-only save retries on 423 lock failure", async () => {
  const stub = buildStub();
  let calls = 0;
  stub.patchResult = (n) => {
    calls += 1;
    if (n === 1) {
      return { ok: false, status: 423, error: "Session is being updated" };
    }
    return { ok: true, status: 200, session: { bpmn_xml_version: 3, diagram_state_version: 6 } };
  };

  const ref = createRef(4);
  const currentMeta = { version: 1, camunda_extensions_by_element_id: {} };

  const start = Date.now();
  const result = await persistCamundaExtensionsViaCanonicalXmlBoundary({
    sessionIdRaw: "sess_1",
    isLocal: false,
    currentXmlRaw: CURRENT_XML,
    currentMetaRaw: currentMeta,
    nextMetaRaw: NEXT_META,
    nextCamundaExtensionsByElementIdRaw: NEXT_META.camunda_extensions_by_element_id,
    baseDiagramStateVersionRaw: 4,
    lastServerDiagramStateVersionRef: ref,
    buildCanonicalXml: ({ xmlText }) => xmlText,
    apiPutBpmnXml: stub.apiPutBpmnXml,
    apiPatchSessionMeta: stub.apiPatchSessionMeta,
    apiGetSession: stub.apiGetSession,
    onSessionSync: stub.onSessionSync,
  });
  const elapsed = Date.now() - start;

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(stub.patchCalls.length, 2);
  assert.ok(elapsed >= 450, `expected backoff ~500ms, got ${elapsed}ms`);
});
