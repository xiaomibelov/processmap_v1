import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBpmnSaveFailureDiagnostics,
  buildBpmnSaveFailureMessage,
  classifyBpmnSaveFailure,
} from "./saveBeforeSwitchDiagnostics.js";

test("classifies 409 as conflict_detected", () => {
  const errorClass = classifyBpmnSaveFailure({
    status: 409,
    error: "revision conflict",
  });
  assert.equal(errorClass, "conflict_detected");
  assert.match(buildBpmnSaveFailureMessage(errorClass), /Конфликт версии BPMN/i);
});

test("classifies 423 locked as conflict_detected", () => {
  const diagnostics = buildBpmnSaveFailureDiagnostics({
    status: 423,
    error: "Locked",
  });
  assert.equal(diagnostics.errorClass, "conflict_detected");
  assert.equal(diagnostics.errorCode, "http_423");
});

test("classifies 403 as permission_denied", () => {
  const diagnostics = buildBpmnSaveFailureDiagnostics({
    status: 403,
    error: "forbidden",
  }, {
    saveAttemptKind: "tab_switch",
    activeBpmnSource: "diagram_modeler",
    sessionId: "sid_1",
  });
  assert.equal(diagnostics.errorClass, "permission_denied");
  assert.equal(diagnostics.canRetry, false);
  assert.equal(diagnostics.canLeaveUnsafely, true);
  assert.equal(diagnostics.diagnosticsSeverity, "high");
});

test("classifies saveXML serialization failure as payload_invalid", () => {
  const diagnostics = buildBpmnSaveFailureDiagnostics({
    error: "saveXML failed: invalid BPMN XML",
  });
  assert.equal(diagnostics.errorClass, "payload_invalid");
  assert.match(diagnostics.userMessage, /Некорректный BPMN\/XML payload/i);
});

test("classifies unsupported activation errors explicitly", () => {
  const diagnostics = buildBpmnSaveFailureDiagnostics({
    errorCode: "activation_unsupported",
    error: "unsupported mode",
  });
  assert.equal(diagnostics.errorClass, "activation_unsupported");
  assert.equal(diagnostics.canRetry, false);
  assert.equal(diagnostics.canLeaveUnsafely, true);
});

test("diagnostics contract keeps source and revision context for tab switch saves", () => {
  const diagnostics = buildBpmnSaveFailureDiagnostics({
    status: 422,
    error: "validation failed",
  }, {
    saveAttemptKind: "tab_switch",
    activeBpmnSource: "diagram_modeler",
    sourceReason: "tab_switch_flush_failed",
    sessionId: "sid_55",
    projectId: "proj_2",
    requestBaseRev: 7,
    storedRev: 6,
    payloadHash: "abc123",
  });
  assert.equal(diagnostics.saveAttemptKind, "tab_switch");
  assert.equal(diagnostics.activeBpmnSource, "diagram_modeler");
  assert.equal(diagnostics.sourceReason, "tab_switch_flush_failed");
  assert.equal(diagnostics.sessionId, "sid_55");
  assert.equal(diagnostics.projectId, "proj_2");
  assert.equal(diagnostics.requestBaseRev, 7);
  assert.equal(diagnostics.storedRev, 6);
  assert.equal(diagnostics.payloadHash, "abc123");
  assert.equal(diagnostics.errorClass, "payload_invalid");
  assert.equal(diagnostics.errorCode, "http_422");
});
