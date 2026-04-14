import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readHeaderSource() {
  return fs.readFileSync(path.join(__dirname, "ProcessStageHeader.jsx"), "utf8");
}

test("header renders explicit conflict action controls for 409 save conflicts", () => {
  const source = readHeaderSource();
  assert.ok(
    source.includes('data-testid="diagram-toolbar-save-conflict-panel"'),
    "conflict primary panel test id must exist",
  );
  assert.ok(
    source.includes('data-testid="diagram-toolbar-save-conflict-title"'),
    "conflict title surface must exist",
  );
  assert.ok(
    source.includes("Обновить сессию"),
    "refresh action label must be rendered",
  );
  assert.ok(
    source.includes("Отбросить локальные изменения"),
    "discard local action label must be rendered",
  );
  assert.ok(
    source.includes("diagram-toolbar-save-conflict-refresh"),
    "refresh button test id must exist",
  );
});

test("header dedupes competing conflict surfaces when primary panel is visible", () => {
  const source = readHeaderSource();
  assert.ok(
    source.includes("const showUploadStatusBadge = saveUploadStatus?.visible && !showConflictActions;"),
    "save upload badge must be suppressed while conflict panel is visible",
  );
  assert.ok(
    source.includes("const showToolbarInlineBadge = !!toolbarInlineMessage && !(showConflictActions && toolbarMessageLooksLikeConflict);"),
    "toolbar inline conflict message must be suppressed when conflict panel is visible",
  );
});
