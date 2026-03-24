import test from "node:test";
import assert from "node:assert/strict";

import buildCamundaExtensionsXmlSyncPayload from "./buildCamundaExtensionsXmlSyncPayload.js";

test("buildCamundaExtensionsXmlSyncPayload returns minimal sync envelope without stale meta fields", () => {
  const payload = buildCamundaExtensionsXmlSyncPayload({
    sessionId: "sid_123",
    finalizedXml: "<bpmn:definitions/>",
    camundaExtensionsByElementId: {
      Activity_1: {
        properties: {
          extensionProperties: [{ id: "p1", name: "k", value: "v" }],
          extensionListeners: [],
        },
        preservedExtensionElements: [],
      },
    },
    storedRev: 42,
    fallbackRev: 7,
    source: "camunda_extensions_save_xml_sync",
    draft: {
      bpmn_meta: { camunda_extensions_by_element_id: { Activity_1: { bad: true } } },
      notes: ["stale"],
    },
  });

  assert.deepEqual(payload, {
    id: "sid_123",
    session_id: "sid_123",
    bpmn_xml: "<bpmn:definitions/>",
    bpmn_xml_version: 42,
    bpmn_meta: {
      camunda_extensions_by_element_id: {
        Activity_1: {
          properties: {
            extensionProperties: [{ id: "p1", name: "k", value: "v" }],
            extensionListeners: [],
          },
          preservedExtensionElements: [],
        },
      },
    },
    _sync_source: "camunda_extensions_save_xml_sync",
  });
  assert.equal("notes" in payload, false);
});

test("buildCamundaExtensionsXmlSyncPayload falls back to fallbackRev when storedRev missing", () => {
  const payload = buildCamundaExtensionsXmlSyncPayload({
    sessionId: "sid_456",
    finalizedXml: "<xml/>",
    fallbackRev: 5,
    source: "custom_sync_source",
  });

  assert.equal(payload.bpmn_xml_version, 5);
  assert.equal(payload._sync_source, "custom_sync_source");
  assert.deepEqual(payload.bpmn_meta, {
    camunda_extensions_by_element_id: {},
  });
});
