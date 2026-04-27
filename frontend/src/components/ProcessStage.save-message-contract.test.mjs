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
