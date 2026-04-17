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

test("header exposes distinct actions for session save and revision creation", () => {
  const source = readHeaderSource();
  assert.ok(source.includes('data-testid="diagram-toolbar-save"'));
  assert.ok(source.includes('data-testid="diagram-toolbar-create-revision"'));
  assert.ok(source.includes("{saveActionText || saveSmartText}"));
  assert.ok(source.includes("Создать новую ревизию"));
});

test("revision action availability is separated from session-save copy", () => {
  const source = readHeaderSource();
  assert.ok(source.includes("const canCreateRevisionFromCurrentState = canSaveNow"));
  assert.ok(source.includes("saveDirtyHint || publishActionRequired"));
  assert.ok(source.includes('const revisionActionTitle = !canSaveNow'));
  assert.ok(source.includes('"Новых изменений для новой ревизии нет."'));
  assert.equal(source.includes("Сохранить версию"), false);
});
