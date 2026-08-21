import assert from "node:assert/strict";
import test from "node:test";

import buildSessionCompanionJazzUiBridgeSnapshot from "./sessionCompanionJazzUiBridge.js";

function buildCompanion({
  xmlVersion = 0,
  graphFingerprint = "",
  saveStatus = "",
  templateId = "",
  templateApplyXmlVersion = 0,
  revisionCount = 0,
} = {}) {
  const revisions = Array.from({ length: Math.max(0, Number(revisionCount || 0)) }).map((_, idx) => {
    const revisionNumber = revisionCount - idx;
    return {
      revision_id: `rev_${revisionNumber}`,
      revision_number: revisionNumber,
      created_at: `2026-03-17T00:0${revisionNumber}:00.000Z`,
      comment: `Revision ${revisionNumber}`,
      source: "manual_publish_revision",
      bpmn_xml: `<definitions><process id='P'><task id='Task_${revisionNumber}'/></process></definitions>`,
      content_hash: `hash_rev_${revisionNumber}`,
      author: { id: "u1", name: "Alice" },
    };
  });
  return {
    bpmn_version_v1: {
      xml_version: xmlVersion,
      graph_fingerprint: graphFingerprint,
      xml_hash: xmlVersion > 0 ? `hash_${xmlVersion}` : "",
      captured_at: "2026-03-17T00:00:00.000Z",
      source: "companion_contract",
    },
    save_state_v1: {
      status: saveStatus,
      last_saved_at: "2026-03-17T00:00:00.000Z",
      stored_rev: xmlVersion,
      requested_base_rev: xmlVersion,
    },
    template_provenance_v1: {
      template_id: templateId,
      template_name: templateId ? `Template ${templateId}` : "",
      template_revision: templateId ? "rev-1" : "",
      applied_at: templateId ? "2026-03-17T00:00:00.000Z" : "",
      bpmn_version_at_apply: {
        xml_version: templateApplyXmlVersion,
      },
    },
    revision_ledger_v1: {
      schema_version: "revision_ledger_v1",
      latest_revision_number: Number(revisionCount || 0),
      latest_revision_id: revisions[0]?.revision_id || "",
      current_revision_id: revisions[0]?.revision_id || "",
      revisions,
    },
  };
}

test("jazz bridge uses jazz companion as active source when jazz snapshot is complete", () => {
  const snapshot = buildSessionCompanionJazzUiBridgeSnapshot({
    sessionCompanionAdapterMode: "jazz",
    legacyCompanionRaw: buildCompanion({ xmlVersion: 3, graphFingerprint: "fp_3", saveStatus: "saved" }),
    jazzCompanionRaw: buildCompanion({ xmlVersion: 7, graphFingerprint: "fp_7", saveStatus: "saved" }),
    durableSessionRaw: { bpmn_xml_version: 7, bpmn_graph_fingerprint: "fp_7" },
  });
  assert.equal(snapshot.sourceMap.companion, "jazz_companion");
  assert.equal(snapshot.version.xmlVersion, 7);
  assert.equal(snapshot.hasFallback, false);
  assert.equal(snapshot.fallbackUsed, false);
  assert.equal(snapshot.readinessState, "healthy");
  assert.equal(snapshot.diagnosticsSeverity, "none");
});

test("jazz bridge falls back to legacy companion when jazz version is missing", () => {
  const snapshot = buildSessionCompanionJazzUiBridgeSnapshot({
    sessionCompanionAdapterMode: "jazz",
    legacyCompanionRaw: buildCompanion({ xmlVersion: 5, graphFingerprint: "fp_5", saveStatus: "saved" }),
    jazzCompanionRaw: buildCompanion({ xmlVersion: 0, graphFingerprint: "", saveStatus: "" }),
    durableSessionRaw: { bpmn_xml_version: 5, bpmn_graph_fingerprint: "fp_5" },
  });
  assert.equal(snapshot.sourceMap.companion, "legacy_companion_fallback");
  assert.equal(snapshot.hasFallback, true);
  assert.equal(snapshot.fallbackUsed, true);
  assert.ok(snapshot.fallbackReasons.includes("jazz_companion_unavailable_or_incomplete"));
  assert.equal(snapshot.readinessState, "warning");
  assert.equal(snapshot.diagnosticsSeverity, "medium");
});

test("save read model in bridge uses transient dirty signal as active UI status", () => {
  const snapshot = buildSessionCompanionJazzUiBridgeSnapshot({
    sessionCompanionAdapterMode: "legacy",
    legacyCompanionRaw: buildCompanion({ xmlVersion: 4, graphFingerprint: "fp_4", saveStatus: "saved" }),
    jazzCompanionRaw: {},
    durableSessionRaw: { bpmn_xml_version: 4, bpmn_graph_fingerprint: "fp_4" },
    uiSaveStateRaw: { saveDirtyHint: true, isManualSaveBusy: false },
  });
  assert.equal(snapshot.save.status, "dirty");
  assert.equal(snapshot.save.isDirty, true);
  assert.equal(snapshot.save.effectiveSource, "ui_runtime_state");
  assert.equal(snapshot.save.readinessState, "transition");
});

test("template provenance read model marks stale when apply version differs from current", () => {
  const snapshot = buildSessionCompanionJazzUiBridgeSnapshot({
    sessionCompanionAdapterMode: "legacy",
    legacyCompanionRaw: buildCompanion({
      xmlVersion: 9,
      graphFingerprint: "fp_9",
      saveStatus: "saved",
      templateId: "tpl_1",
      templateApplyXmlVersion: 7,
    }),
    durableSessionRaw: { bpmn_xml_version: 9, bpmn_graph_fingerprint: "fp_9" },
  });
  assert.equal(snapshot.templateProvenance.templateId, "tpl_1");
  assert.equal(snapshot.templateProvenance.isStale, true);
  assert.equal(snapshot.templateProvenance.readinessState, "warning");
});

test("legacy mode keeps bridge in legacy_only without jazz fallback markers", () => {
  const snapshot = buildSessionCompanionJazzUiBridgeSnapshot({
    sessionCompanionAdapterMode: "legacy",
    legacyCompanionRaw: buildCompanion({ xmlVersion: 2, graphFingerprint: "fp_2", saveStatus: "saved", revisionCount: 2 }),
    jazzCompanionRaw: buildCompanion({ xmlVersion: 7, graphFingerprint: "fp_7", saveStatus: "saved" }),
    durableSessionRaw: { bpmn_xml_version: 2, bpmn_graph_fingerprint: "fp_2" },
    liveDraftRaw: { bpmn_xml: "<definitions><process id='P'></process></definitions>" },
  });
  assert.equal(snapshot.bridgeMode, "legacy_only");
  assert.equal(snapshot.sourceMap.companion, "legacy_companion");
  assert.equal(snapshot.revisionHistory.totalCount, 2);
  assert.equal(snapshot.sourceMap.revisionHistory, "legacy_companion:revision_ledger_v1");
  assert.equal(snapshot.hasFallback, false);
  assert.equal(snapshot.fallbackUsed, false);
  assert.equal(snapshot.readinessState, "healthy");
  assert.equal(snapshot.diagnosticsSeverity, "none");
});

test("unsupported activation state is surfaced as degraded bridge diagnostics", () => {
  const snapshot = buildSessionCompanionJazzUiBridgeSnapshot({
    sessionCompanionAdapterMode: "legacy",
    activationContextRaw: {
      activationSource: "env",
      pilotEnabled: false,
      adapterRequested: "jazz",
      adapterModeEffective: "legacy",
      unsupportedState: true,
      unsupportedReason: "adapter_requested_without_pilot",
    },
    legacyCompanionRaw: buildCompanion({ xmlVersion: 2, graphFingerprint: "fp_2", saveStatus: "saved" }),
    durableSessionRaw: { bpmn_xml_version: 2, bpmn_graph_fingerprint: "fp_2" },
  });
  assert.equal(snapshot.fallbackUsed, true);
  assert.ok(snapshot.fallbackReasons.includes("activation_unsupported:adapter_requested_without_pilot"));
  assert.equal(snapshot.readinessState, "degraded");
  assert.equal(snapshot.diagnosticsSeverity, "high");
  assert.equal(snapshot.diagnostics.activation.unsupportedState, true);
});
