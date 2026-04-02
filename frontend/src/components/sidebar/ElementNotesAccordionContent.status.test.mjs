import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const notesPanelSource = fs.readFileSync(new URL("../NotesPanel.jsx", import.meta.url), "utf8");
const notesContentSource = fs.readFileSync(new URL("./ElementNotesAccordionContent.jsx", import.meta.url), "utf8");

test("element notes block exposes calm Russian status copy for saved/local/syncing/error", () => {
  assert.match(notesContentSource, /label: "Сохранено"/);
  assert.match(notesContentSource, /label: "Есть локальные изменения"/);
  assert.match(notesContentSource, /label: "Синхронизация…"/);
  assert.match(notesContentSource, /label: "Ошибка"/);
  assert.match(notesContentSource, /helper: "Заметка сохранена\."/);
  assert.match(notesContentSource, /helper: "Текст заметки изменён локально\."/);
  assert.match(notesContentSource, /helper: "Заметка сохраняется\."/);
  assert.match(notesContentSource, /helper: "Не удалось сохранить заметку\. Текст остался в редакторе\."/);
});

test("element notes block keeps CTA discipline: only error state exposes retry", () => {
  assert.match(notesContentSource, /cta: "Повторить"/);
  assert.match(notesContentSource, /<SidebarTrustStatus/);
  assert.match(notesContentSource, /testIdPrefix="element-notes-status"/);
});

test("NotesPanel derives notes trust state with precedence syncing > error > local > saved", () => {
  assert.match(notesPanelSource, /const elementHasLocalChanges = str\(elementText\)\.length > 0;/);
  assert.match(notesPanelSource, /const elementSyncState = elementBusy\s*\?\s*"syncing"\s*:\s*\(elementSaveFailed \? "error" : \(elementHasLocalChanges \? "local" : "saved"\)\);/);
});

test("NotesPanel reuses existing element note save lifecycle and preserves local draft on failure", () => {
  assert.match(notesPanelSource, /async function sendElementNote\(\)/);
  assert.match(notesPanelSource, /setElementBusy\(true\);/);
  assert.match(notesPanelSource, /setElementSaveFailed\(false\);\s*setElementErr\(""\);/);
  assert.match(notesPanelSource, /if \(rr && rr\.ok === false\) \{\s*setElementSaveFailed\(true\);/);
  assert.match(notesPanelSource, /setElementSaveFailed\(false\);\s*setElementText\(""\);/);
  assert.match(notesPanelSource, /catch \(e\) \{\s*setElementSaveFailed\(true\);/);
});

test("NotesPanel clears stale note error on new edit and passes runtime state into the notes block", () => {
  assert.match(notesPanelSource, /onElementTextChange=\{\(value\) => \{\s*setElementSaveFailed\(false\);\s*setElementText\(value\);/);
  assert.match(notesPanelSource, /elementSyncState=\{isElementMode \? elementSyncState : "saved"\}/);
});
