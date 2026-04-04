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

test("undo/redo controls use compact icon buttons with russian accessibility labels", () => {
  const source = readHeaderSource();
  assert.ok(
    source.includes('aria-label="Шаг назад"'),
    "undo button must expose russian aria-label",
  );
  assert.ok(
    source.includes('aria-label="Повторить отменённое действие"'),
    "redo button must expose russian aria-label",
  );
  assert.equal(
    />\s*Шаг назад\s*</.test(source),
    false,
    "undo button must be icon-only, not long text",
  );
  assert.equal(
    />\s*Повторить отменённое действие\s*</.test(source),
    false,
    "redo button must be icon-only, not long text",
  );
});

test("save and git status badges are rendered in right header cluster", () => {
  const source = readHeaderSource();
  const rightClusterIdx = source.indexOf('className="diagramToolbarRightStatus"');
  const saveStatusIdx = source.indexOf('data-testid="diagram-toolbar-save-status"');
  const gitStatusIdx = source.indexOf('data-testid="diagram-toolbar-publish-git-mirror-status"');
  assert.ok(rightClusterIdx !== -1, "right status cluster must exist");
  assert.ok(saveStatusIdx > rightClusterIdx, "save status badge must be inside right status cluster");
  assert.ok(gitStatusIdx > rightClusterIdx, "git mirror status badge must be inside right status cluster");
});
