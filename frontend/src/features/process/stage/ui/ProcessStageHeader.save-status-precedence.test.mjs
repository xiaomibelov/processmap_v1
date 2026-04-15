import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("version-aware publish message suppresses duplicate generic draft-saved badge", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStageHeader.jsx"), "utf8");
  assert.equal(
    source.includes('const suppressDraftSavedBadge = /^Опубликована версия \\d+\\.$/.test(toolbarMessage)'),
    true,
  );
  assert.equal(
    source.includes("const showGenericSaveStatusBadge = showSaveStatusBadgeResolved")
      && source.includes("&& !suppressDraftSavedBadge")
      && source.includes("&& !showDraftRelationBadge;"),
    true,
  );
  assert.equal(source.includes("{showGenericSaveStatusBadge ? ("), true);
});

test("draft save inline message is suppressed when primary draft status surface is already shown", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessStageHeader.jsx"), "utf8");
  assert.equal(source.includes("const isDraftSavedToolbarMessage = ("), true);
  assert.equal(source.includes('toolbarMessageNormalized === "черновик сохранён"'), true);
  assert.equal(source.includes('toolbarMessageNormalized === "черновик синхронизирован"'), true);
  assert.equal(source.includes("const hasPrimaryDraftStatusSurface = showSaveStatusBadge || showDraftRelationBadge;"), true);
  assert.equal(
    source.includes("&& !(")
      && source.includes("isDraftSavedToolbarMessage")
      && source.includes("hasPrimaryDraftStatusSurface"),
    true,
  );
});
