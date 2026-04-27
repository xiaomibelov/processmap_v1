import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("manual save ack toast uses 4-second visibility window", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
  assert.equal(source.includes("const SAVE_ACK_TOAST_HIDE_MS = 4000;"), true);
  assert.equal(source.includes("const SAVE_ACK_TOAST_HIDE_MS = 1500;"), false);
});

test("manual save and BPMN version toasts pass explicit source type", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
  assert.equal(source.includes('showSaveAckToast("Сохранение...", "info", createRevision ? "bpmn_version" : "save");'), true);
  assert.equal(source.includes('showSaveAckToast(outcomeMessage, outcomeTone, createRevision ? "bpmn_version" : "save");'), true);
});
