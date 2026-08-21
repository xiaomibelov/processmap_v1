import assert from "node:assert/strict";
import test from "node:test";

import buildSessionSaveReadModel from "./saveReadModel.js";

function versionSnapshot({
  xmlVersion = 0,
  effectiveSource = "missing",
  durableAvailable = false,
  isMissing = true,
} = {}) {
  return {
    xmlVersion: Number(xmlVersion || 0),
    effectiveSource: String(effectiveSource || "missing"),
    isMissing: isMissing === true,
    sourceProvenance: {
      durableAvailable: durableAvailable === true,
    },
  };
}

test("save model marks fallback-derived save as warning instead of silent healthy", () => {
  const model = buildSessionSaveReadModel({
    companionSaveRaw: {},
    currentVersionSnapshotRaw: versionSnapshot({
      xmlVersion: 5,
      effectiveSource: "durable_backend_version_fallback",
      durableAvailable: true,
      isMissing: false,
    }),
    uiStateRaw: { saveDirtyHint: false, isManualSaveBusy: false },
  });
  assert.equal(model.status, "saved");
  assert.equal(model.isFallback, true);
  assert.equal(model.isDurableConfirmed, true);
  assert.equal(model.readinessState, "warning");
  assert.equal(model.diagnosticsSeverity, "medium");
  assert.equal(model.bridgeLagReason, "save_state_missing_using_version_fallback");
});

test("save model marks companion saved + durable aligned as healthy", () => {
  const model = buildSessionSaveReadModel({
    companionSaveRaw: {
      status: "saved",
      stored_rev: 9,
      requested_base_rev: 9,
      last_saved_at: "2026-03-17T00:00:00.000Z",
    },
    currentVersionSnapshotRaw: versionSnapshot({
      xmlVersion: 9,
      effectiveSource: "legacy_companion:bpmn_version_v1",
      durableAvailable: true,
      isMissing: false,
    }),
    uiStateRaw: {},
  });
  assert.equal(model.isSaved, true);
  assert.equal(model.isFallback, false);
  assert.equal(model.isDurableConfirmed, true);
  assert.equal(model.readinessState, "healthy");
  assert.equal(model.diagnosticsSeverity, "none");
});
