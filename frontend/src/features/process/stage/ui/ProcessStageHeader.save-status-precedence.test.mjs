import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("header no longer uses inline save-status badge as primary save/version channel", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStageHeader.jsx"), "utf8");
  assert.equal(source.includes('toolbarMessageNormalized === "сохранено внутри версии"'), true);
  assert.equal(source.includes("const isSaveVersionToolbarMessage = ("), true);
  assert.equal(source.includes('toolbarMessageNormalized === "создана новая версия bpmn"'), true);
  assert.equal(source.includes('data-testid="diagram-toolbar-save-status"'), false);
  assert.equal(source.includes('data-testid="diagram-toolbar-notification-anchor"'), true);
});

test("draft save inline message is suppressed when primary draft status surface is already shown", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStageHeader.jsx"), "utf8");
  assert.equal(source.includes("const isDraftSavedToolbarMessage = ("), true);
  assert.equal(source.includes('toolbarMessageNormalized === "черновик сохранён"'), true);
  assert.equal(source.includes('toolbarMessageNormalized === "черновик синхронизирован"'), true);
  assert.equal(source.includes("const hasPrimaryDraftStatusSurface = showSaveStatusBadgeResolved;"), true);
  assert.equal(source.includes("&& !isSaveVersionToolbarMessage"), true);
  assert.equal(
    source.includes("&& !(")
      && source.includes("isDraftSavedToolbarMessage")
      && source.includes("hasPrimaryDraftStatusSurface"),
    true,
  );
});

test("conflict state dominates and suppresses success-like draft/sync surfaces", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStageHeader.jsx"), "utf8");
  assert.equal(source.includes("const hasDominantConflictState = isConflictState;"), true);
  assert.equal(
    source.includes("const showSaveStatusBadgeResolved = showSaveStatusBadge && !hasDominantConflictState;"),
    true,
  );
  assert.equal(
    source.includes("const showToolbarInlineBadge = !!toolbarInlineMessage")
      && source.includes("&& !hasDominantConflictState"),
    true,
  );
});
