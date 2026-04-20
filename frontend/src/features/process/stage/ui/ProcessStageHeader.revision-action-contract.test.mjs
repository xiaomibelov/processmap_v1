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
  assert.ok(source.includes('{saveActionText || "Сохранить сессию"}'));
  assert.ok(source.includes("Создать новую версию"));
});

test("revision action availability is separated from session-save copy", () => {
  const source = readHeaderSource();
  assert.ok(source.includes("const canCreateRevisionFromCurrentState = canCreateRevisionNow !== false"));
  assert.ok(source.includes('const revisionActionTitle = !canCreateRevisionFromCurrentState'));
  assert.ok(source.includes('"Создать новую версию из текущего состояния сессии"'));
  assert.ok(source.includes('"Создание версии доступно в Diagram/XML"'));
  assert.equal(source.includes("Сохранить версию"), false);
});

test("session-save action stays visible as reassurance control whenever session is open", () => {
  const source = readHeaderSource();
  assert.ok(source.includes("{hasSession ? ("));
  assert.ok(source.includes("onClick={handleSaveCurrentTab}"));
  assert.equal(source.includes("showSaveActionButton ? ("), false);
});
