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
  });

  assert.equal(out.ok, true);
  assert.equal(putCalls.length, 2);
  assert.equal(putCalls[0].options.baseDiagramStateVersion, 5);
  assert.equal(putCalls[1].options.baseDiagramStateVersion, 9);
  assert.equal(putCalls[1].options.reason, "manual_save:camunda_extensions");
  assert.equal(putCalls[1].options.bpmnMeta.flow_meta.Flow_1.tier, "P1");
  assert.equal(getCalls.length >= 2, true);
  assert.equal(syncCalls.length, 1);
});
