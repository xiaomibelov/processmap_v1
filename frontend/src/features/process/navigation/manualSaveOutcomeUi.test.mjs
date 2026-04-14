import test from "node:test";
import assert from "node:assert/strict";

import { resolveManualSaveOutcomeUi } from "./manualSaveOutcomeUi.js";

test("manual save success + companion success keeps primary success state", () => {
  const ui = resolveManualSaveOutcomeUi({
    primarySaveOk: true,
    primarySavePending: false,
    companionError: "",
    publishInfo: "",
  });

  assert.equal(ui.primaryState, "primary_saved");
  assert.equal(ui.genErr, "");
  assert.equal(ui.infoMsg, "Черновик сохранён.");
  assert.equal(ui.companionSeverity, "none");
});

test("manual save success + companion failure is surfaced as secondary warning", () => {
  const ui = resolveManualSaveOutcomeUi({
    primarySaveOk: true,
    primarySavePending: false,
    companionError: "session_meta_patch_failed",
    publishInfo: "Опубликована версия 7.",
  });

  assert.equal(ui.primaryState, "primary_saved_companion_warning");
  assert.equal(ui.genErr, "");
  assert.equal(ui.companionSeverity, "warning");
  assert.match(ui.infoMsg, /Опубликована версия 7\./);
  assert.match(ui.infoMsg, /Companion metadata не синхронизированы\./);
});

test("manual save primary failure stays primary error", () => {
  const ui = resolveManualSaveOutcomeUi({
    primarySaveOk: false,
    primarySaveError: "Не удалось сохранить BPMN.",
  });

  assert.equal(ui.primaryState, "primary_failed");
  assert.equal(ui.genErr, "Не удалось сохранить BPMN.");
  assert.equal(ui.infoMsg, "");
  assert.equal(ui.companionSeverity, "none");
});

test("manual save conflict remains primary error and is not downgraded", () => {
  const ui = resolveManualSaveOutcomeUi({
    primarySaveOk: false,
    primarySaveError: "BPMN: конфликт сохранения (HTTP 409)",
  });

  assert.equal(ui.primaryState, "primary_failed");
  assert.match(ui.genErr, /конфликт сохранения/i);
  assert.equal(ui.infoMsg, "");
  assert.equal(ui.companionSeverity, "none");
});
