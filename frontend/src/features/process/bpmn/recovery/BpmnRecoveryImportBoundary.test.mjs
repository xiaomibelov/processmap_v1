import test from "node:test";
import assert from "node:assert/strict";

import { evaluateRemoteRecoveryImportBoundary } from "./BpmnRecoveryImportBoundary.js";

test("evaluateRemoteRecoveryImportBoundary mirrors remote-apply contract with explicit recovery reason", () => {
  const applyDecision = evaluateRemoteRecoveryImportBoundary({
    sessionId: "s1",
    draftSessionId: "s1",
    remoteVersionToken: "tok-2",
    lastAppliedRemoteVersionToken: "tok-1",
    forceApplyRemoteVersionToken: "",
    xmlDirty: false,
    currentXml: "<a/>",
    draftXml: "<b/>",
  });
  assert.equal(applyDecision.apply, true);
  assert.equal(applyDecision.reason, "apply_remote_bpmn_xml");

  const skippedDecision = evaluateRemoteRecoveryImportBoundary({
    sessionId: "s1",
    draftSessionId: "s1",
    remoteVersionToken: "tok-2",
    lastAppliedRemoteVersionToken: "tok-1",
    xmlDirty: true,
    currentXml: "<a/>",
    draftXml: "<b/>",
  });
  assert.equal(skippedDecision.apply, false);
  assert.equal(skippedDecision.reason, "xml_editor_dirty");
});

test("evaluateRemoteRecoveryImportBoundary skips self-origin token rehydrate", () => {
  const decision = evaluateRemoteRecoveryImportBoundary({
    sessionId: "s1",
    draftSessionId: "s1",
    remoteVersionToken: "tok-2",
    localVersionToken: "tok-2",
    lastAppliedRemoteVersionToken: "tok-1",
    xmlDirty: false,
    currentXml: "<a/>",
    draftXml: "<b/>",
  });
  assert.equal(decision.apply, false);
  assert.equal(decision.reason, "remote_token_matches_local");
});
