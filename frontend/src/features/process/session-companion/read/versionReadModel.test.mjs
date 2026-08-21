import assert from "node:assert/strict";
import test from "node:test";

import buildSessionVersionReadModel from "./versionReadModel.js";

function version(xmlVersion, fingerprint = "") {
  return {
    xml_version: Number(xmlVersion || 0),
    graph_fingerprint: String(fingerprint || ""),
    xml_hash: Number(xmlVersion || 0) > 0 ? `hash_${xmlVersion}` : "",
    captured_at: "2026-03-17T00:00:00.000Z",
    source: "test",
  };
}

test("companion version is active when versions match", () => {
  const model = buildSessionVersionReadModel({
    companionVersionRaw: version(7, "fp_7"),
    durableVersionRaw: version(7, "fp_7"),
    companionSource: "legacy_companion",
  });
  assert.equal(model.xmlVersion, 7);
  assert.equal(model.effectiveSource, "legacy_companion:bpmn_version_v1");
  assert.equal(model.revisionContext.hasMismatch, false);
  assert.equal(model.revisionContext.mismatchGuardUsesDurable, false);
  assert.equal(model.readinessState, "healthy");
  assert.equal(model.diagnosticsSeverity, "none");
});

test("durable version fallback is used when companion version is missing", () => {
  const model = buildSessionVersionReadModel({
    companionVersionRaw: version(0, ""),
    durableVersionRaw: version(5, "fp_5"),
    companionSource: "legacy_companion",
  });
  assert.equal(model.xmlVersion, 5);
  assert.equal(model.effectiveSource, "durable_backend_version_fallback");
  assert.equal(model.sourceProvenance.fallbackUsed, true);
  assert.equal(model.readinessState, "warning");
  assert.equal(model.diagnosticsSeverity, "medium");
});

test("older companion version is rejected by mismatch guard and durable version becomes active", () => {
  const model = buildSessionVersionReadModel({
    companionVersionRaw: version(2, "fp_2"),
    durableVersionRaw: version(4, "fp_4"),
    companionSource: "legacy_companion",
  });
  assert.equal(model.xmlVersion, 4);
  assert.equal(model.effectiveSource, "durable_backend_version_mismatch_guard");
  assert.equal(model.revisionContext.hasMismatch, true);
  assert.equal(model.revisionContext.companionIsOlderThanDurable, true);
  assert.equal(model.revisionContext.mismatchGuardUsesDurable, true);
  assert.equal(model.mismatchReason, "companion_version_older_than_durable");
  assert.equal(model.sourceProvenance.stalePayloadRejected, true);
  assert.equal(model.readinessState, "warning");
  assert.equal(model.diagnosticsSeverity, "medium");
});

test("newer companion version is still allowed when durable lags behind", () => {
  const model = buildSessionVersionReadModel({
    companionVersionRaw: version(9, "fp_9"),
    durableVersionRaw: version(8, "fp_8"),
    companionSource: "legacy_companion_fallback",
  });
  assert.equal(model.xmlVersion, 9);
  assert.equal(model.effectiveSource, "legacy_companion_fallback:bpmn_version_v1");
  assert.equal(model.revisionContext.hasMismatch, true);
  assert.equal(model.revisionContext.mismatchGuardUsesDurable, false);
  assert.equal(model.mismatchReason, "companion_version_newer_than_durable");
  assert.equal(model.readinessState, "warning");
  assert.equal(model.diagnosticsSeverity, "medium");
});
