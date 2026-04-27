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
  assert.ok(source.includes('data-testid="diagram-toolbar-version-chip"'));
  assert.ok(source.includes("{resolvedSaveActionText}"));
  assert.ok(source.includes("{resolvedCreateRevisionActionText}"));
  const versionChipIdx = source.indexOf('data-testid="diagram-toolbar-version-chip"');
  const createVersionIdx = source.indexOf('data-testid="diagram-toolbar-create-revision"');
  const saveIdx = source.indexOf('data-testid="diagram-toolbar-save"');
  assert.ok(versionChipIdx !== -1 && createVersionIdx !== -1 && saveIdx !== -1);
  assert.ok(versionChipIdx < createVersionIdx && createVersionIdx < saveIdx);
});

test("revision action availability is separated from session-save copy", () => {
  const source = readHeaderSource();
  assert.ok(source.includes("const canCreateRevisionFromCurrentState = canCreateRevisionNow !== false"));
  assert.ok(source.includes("const showCreateRevisionNoDiffHint = hasSession"));
  assert.ok(source.includes("createRevisionNoDiffHintVisible === true"));
  assert.ok(source.includes('"Создать версию BPMN из текущего состояния сессии."'));
  assert.ok(source.includes('"Версия BPMN не будет создана: нет изменений сессии после последней версии BPMN."'));
  assert.ok(source.includes('"Создание версии BPMN временно недоступно."'));
  assert.ok(source.includes('data-testid="diagram-toolbar-create-revision-no-diff-hint"'));
  assert.equal(source.includes('"Создание версии доступно в Diagram/XML"'), false);
  assert.equal(source.includes("Сохранить версию"), false);
});

test("session-save action stays visible as reassurance control whenever session is open", () => {
  const source = readHeaderSource();
  assert.ok(source.includes("{hasSession ? ("));
  assert.ok(source.includes("onClick={handleSaveCurrentTab}"));
  assert.equal(source.includes("showSaveActionButton ? ("), false);
});
