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
    source.includes('const suppressDraftSavedBadge = /^Опубликовано как версия R\\d+\\.$/.test(toolbarMessage)'),
    true,
  );
  assert.equal(
    source.includes('const showGenericSaveStatusBadge = showSaveStatusBadgeResolved && !suppressDraftSavedBadge;'),
    true,
  );
  assert.equal(source.includes("{showGenericSaveStatusBadge ? ("), true);
});
