import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBpmnSaveFailureDiagnostics,
  buildBpmnSaveFailureMessage,
  classifyBpmnSaveFailure,
  sanitizeUserErrorText,
  saveXmlSafely,
  stripUnsupportedTemplateValues,
} from "./saveBeforeSwitchDiagnostics.js";

test("classifies 409 as conflict_detected", () => {
  const errorClass = classifyBpmnSaveFailure({
    status: 409,
    error: "revision conflict",
  });
  assert.equal(errorClass, "conflict_detected");
  assert.match(buildBpmnSaveFailureMessage(errorClass), /Версия сессии изменилась/i);
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
  assert.match(diagnostics.userMessage, /Схема диаграммы не прошла проверку/i);
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

test("buildBpmnSaveFailureMessage never includes raw JS exception", () => {
  const message = buildBpmnSaveFailureMessage(
    "unknown_save_failure",
    "Cannot read properties of undefined (reading 'isGeneric')",
  );
  assert.equal(message, "Не удалось сохранить изменения. Попробуйте ещё раз; если не поможет — перезагрузите страницу.");
  assert.ok(!message.includes("isGeneric"));
  assert.ok(!message.includes("undefined"));
});

test("buildBpmnSaveFailureMessage uses user-safe copy for known classes", () => {
  assert.equal(
    buildBpmnSaveFailureMessage("permission_denied", "raw backend detail"),
    "Нет прав на сохранение этой сессии. Попросите доступ у владельца.",
  );
  assert.equal(
    buildBpmnSaveFailureMessage("conflict_detected"),
    "Версия сессии изменилась. Мы синхронизируем изменения автоматически; если синхронизация не поможет — сохраним полностью.",
  );
  assert.equal(
    buildBpmnSaveFailureMessage("payload_invalid"),
    "Схема диаграммы не прошла проверку. Попробуйте отменить последнее действие или перезагрузите страницу.",
  );
  assert.equal(
    buildBpmnSaveFailureMessage("source_state_invalid"),
    "Состояние диаграммы устарело. Попробуйте сохранить ещё раз.",
  );
  assert.equal(
    buildBpmnSaveFailureMessage("activation_unsupported"),
    "Текущий режим редактора не поддерживает сохранение. Перезагрузите страницу.",
  );
  assert.equal(
    buildBpmnSaveFailureMessage("backend_error"),
    "Сервер не смог сохранить изменения. Попробуйте ещё раз через несколько секунд.",
  );
});

test("sanitizeUserErrorText whitelists short codes only", () => {
  assert.equal(sanitizeUserErrorText("http_409"), "http_409");
  assert.equal(sanitizeUserErrorText("save_failed"), "save_failed");
  assert.equal(sanitizeUserErrorText("bpmn_serialize_failed"), "bpmn_serialize_failed");
  assert.equal(sanitizeUserErrorText("http_422"), "http_422");
  assert.equal(sanitizeUserErrorText("Cannot read properties of undefined (reading 'isGeneric')"), "");
  assert.equal(sanitizeUserErrorText("detail: SQL error from backend"), "");
  assert.equal(sanitizeUserErrorText(""), "");
  assert.equal(sanitizeUserErrorText(null), "");
});

test("stripUnsupportedTemplateValues removes descriptor-less moddle values and counts them", async () => {
  const bo = {
    $type: "bpmn:Task",
    name: "Task A",
    unsupportedVal: { $type: "pm:TemplateValue" },
    supportedVal: { $type: "bpmn:FormalExpression", $descriptor: { name: "expr" } },
    mixedList: [
      { $type: "pm:TemplateValue" },
      { $type: "bpmn:FormalExpression", $descriptor: { name: "expr" } },
    ],
    plainList: [1, 2, 3],
  };
  const inst = {
    get(name) {
      if (name === "elementRegistry") {
        return { getAll: () => [{ businessObject: bo }] };
      }
      return null;
    },
  };
  const removed = await stripUnsupportedTemplateValues(inst);
  assert.equal(removed, 2);
  assert.equal(bo.unsupportedVal, null);
  assert.equal(bo.mixedList.length, 1);
  assert.ok(bo.supportedVal);
  assert.deepEqual(bo.plainList, [1, 2, 3]);
  assert.equal(bo.name, "Task A");
});

test("saveXmlSafely returns xml on first success without stripping", async () => {
  const inst = {
    saveCalls: 0,
    async saveXML() {
      this.saveCalls += 1;
      return { xml: "<xml/>" };
    },
  };
  const out = await saveXmlSafely(inst, { format: true });
  assert.equal(out.ok, true);
  assert.equal(out.xml, "<xml/>");
  assert.equal(out.recovered, undefined);
  assert.equal(inst.saveCalls, 1);
});

test("saveXmlSafely recovers once after strip and logs the strip event", async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(" ")); };
  try {
    const bo = { $type: "bpmn:Task", bad: { $type: "pm:TemplateValue" } };
    const inst = {
      saveCalls: 0,
      async saveXML() {
        this.saveCalls += 1;
        if (this.saveCalls === 1) throw new Error("serialize failed on descriptor-less value");
        return { xml: "<xml ok=\"1\"/>" };
      },
      get(name) {
        if (name === "elementRegistry") return { getAll: () => [{ businessObject: bo }] };
        return null;
      },
    };
    const out = await saveXmlSafely(inst, { format: true });
    assert.equal(out.ok, true);
    assert.equal(out.recovered, true);
    assert.equal(out.xml, "<xml ok=\"1\"/>");
    assert.equal(inst.saveCalls, 2);
    assert.equal(bo.bad, null);
    assert.ok(warnings.some((w) => /strip/i.test(w)), "strip event must be logged");
  } finally {
    console.warn = originalWarn;
  }
});

test("saveXmlSafely fails closed when retry serialization also fails", async () => {
  const inst = {
    saveCalls: 0,
    async saveXML() {
      this.saveCalls += 1;
      throw new Error(`boom ${this.saveCalls}`);
    },
    get() { return { getAll: () => [] }; },
  };
  const out = await saveXmlSafely(inst, { format: true });
  assert.equal(out.ok, false);
  assert.equal(out.errorCode, "bpmn_serialize_failed");
  assert.equal(inst.saveCalls, 2);
  assert.match(out.diagnostics.firstError, /boom 1/);
  assert.match(out.diagnostics.secondError, /boom 2/);
});

test("saveXmlSafely rejects invalid XML after strip recovery", async () => {
  const bo = { $type: "bpmn:Task", bad: { $type: "pm:TemplateValue" } };
  const inst = {
    saveCalls: 0,
    async saveXML() {
      this.saveCalls += 1;
      if (this.saveCalls === 1) throw new Error("serialize failed");
      return { xml: "" };
    },
    get(name) {
      if (name === "elementRegistry") return { getAll: () => [{ businessObject: bo }] };
      return null;
    },
  };
  const out = await saveXmlSafely(inst, { format: true });
  assert.equal(out.ok, false);
  assert.equal(out.errorCode, "bpmn_serialize_failed");
});
