import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("manual save no-op message uses saved-within-version wording instead of legacy already-saved phrase", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
  assert.equal(source.includes("Сессия уже сохранена: изменений схемы нет."), false);
  assert.equal(source.includes("Сохранено внутри версии."), true);
});

test("process status feedback is bridged to source-prefixed toast instead of header inline text", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
  assert.equal(source.includes("resolveProcessToastView"), true);
  assert.equal(source.includes("processStatusToastLastSignatureRef"), true);
  assert.equal(source.includes("showSaveAckToast(message, tone);"), true);
  assert.equal(source.includes("toolbarInlineMessage"), false);
});

test("plain success save-ack is routed to the header status slot, not the floating toast", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
  assert.equal(source.includes("saveStatusSlotFlash"), true);
  assert.equal(source.includes("setSaveStatusSlotFlash"), true);
  // Маршрутизация: только короткий success без действий/persistent/kind уходит в слот.
  assert.equal(source.includes('requestedKind !== "remote_update"'), true);
  assert.equal(source.includes('requestedKind !== "conflict"'), true);
  // Конфликт и remote_update по-прежнему идут в toast-стек.
  assert.equal(source.includes('kind: "remote_update"'), true);
  assert.equal(source.includes("ProcessToastViewport"), true);
});

test("success save-ack no longer renders as floating toast over the diagram toolbar", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
  // Viewport остаётся для событийных тостов (conflict/remote_update/hybrid),
  // но save-ack внутри него не рендерится: маршрутизация уходит в слот до setSaveAckToast.
  assert.equal(source.includes("DiagramToolbarSaveStatusSlot") || source.includes("saveStatusSlotFlashView") || source.includes("saveStatusSlotFlash"), true);
});
