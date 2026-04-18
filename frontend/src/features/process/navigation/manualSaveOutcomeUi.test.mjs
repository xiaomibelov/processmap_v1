import test from "node:test";
import assert from "node:assert/strict";

import { resolveManualSaveOutcomeUi } from "./manualSaveOutcomeUi.js";

test("manual save success + companion success keeps primary success state", () => {
  const ui = resolveManualSaveOutcomeUi({
    primarySaveOk: true,
    primarySavePending: false,
    companionError: "",
    saveInfo: "",
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
    saveInfo: "Сессия сохранена.",
  });

  assert.equal(ui.primaryState, "primary_saved_companion_warning");
  assert.equal(ui.genErr, "");
  assert.equal(ui.companionSeverity, "warning");
  assert.match(ui.infoMsg, /Сессия сохранена\./);
  assert.match(ui.infoMsg, /Companion metadata не синхронизированы\./);
});

test("manual save no-op stays in session-save semantics and avoids revision wording", () => {
  const ui = resolveManualSaveOutcomeUi({
    primarySaveOk: true,
    primarySavePending: false,
    companionError: "",
    saveInfo: "Сессия уже сохранена: изменений схемы нет.",
  });

  assert.equal(ui.primaryState, "primary_saved_published");
  assert.equal(ui.genErr, "");
  assert.equal(ui.companionSeverity, "none");
  assert.match(ui.infoMsg, /Сессия уже сохранена/i);
  assert.equal(ui.infoMsg.toLowerCase().includes("верси"), false);
});

test("explicit revision creation keeps revision-specific success copy", () => {
  const ui = resolveManualSaveOutcomeUi({
    primarySaveOk: true,
    primarySavePending: false,
    companionError: "",
    saveInfo: "Создана новая ревизия.",
  });

  assert.equal(ui.primaryState, "primary_saved_published");
  assert.equal(ui.genErr, "");
  assert.equal(ui.companionSeverity, "none");
  assert.match(ui.infoMsg, /Создана новая ревизия\./);
  assert.equal(ui.infoMsg.toLowerCase().includes("сессия сохранена"), false);
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

test("manual save stale auto-retry is surfaced as explicit non-blocking info", () => {
  const ui = resolveManualSaveOutcomeUi({
    primarySaveOk: true,
    staleRetryApplied: true,
    publishInfo: "Опубликована версия 8.",
  });

  assert.equal(ui.primaryState, "primary_saved_published");
  assert.equal(ui.genErr, "");
  assert.match(ui.infoMsg, /Опубликована версия 8\./);
  assert.match(ui.infoMsg, /автоматически повторено на актуальной версии/i);
  assert.equal(ui.companionSeverity, "none");
});
