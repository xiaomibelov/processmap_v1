import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("header no longer uses generic inline status badge as save/version channel", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStageHeader.jsx"), "utf8");
  assert.equal(source.includes("toolbarInlineMessage"), false);
  assert.equal(source.includes("showToolbarInlineBadge"), false);
  assert.equal(source.includes('data-testid="diagram-toolbar-save-status"'), false);
  assert.equal(source.includes('data-testid="diagram-toolbar-notification-anchor"'), true);
});

test("header keeps process feedback anchored to toast surface", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStageHeader.jsx"), "utf8");
  assert.equal(source.includes('data-testid="diagram-toolbar-notification-anchor"'), true);
  assert.equal(source.includes("process-save-ack-toast"), false);
  assert.equal(source.includes("Сохранено внутри версии"), false);
  assert.equal(source.includes("Создана новая версия BPMN"), false);
});

test("conflict state dominates and suppresses success-like draft/sync surfaces", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStageHeader.jsx"), "utf8");
  assert.equal(
    source.includes("const showConflictModalActive = isConflictState && saveConflictActions?.visible === true;"),
    true,
  );
  assert.equal(source.includes("const showUploadStatusBadge = saveUploadStatus?.visible"), true);
  assert.equal(source.includes("&& !showConflictModalActive"), true);
});
