import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const notesPanelSource = fs.readFileSync(new URL("./NotesPanel.jsx", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const notesContentSource = fs.readFileSync(new URL("./sidebar/ElementNotesAccordionContent.jsx", import.meta.url), "utf8");

test("notes extraction preview is wired through a dedicated preview callback", () => {
  assert.match(appSource, /apiPreviewNotesExtraction/);
  assert.match(appSource, /async function previewNotesExtraction\(text\)/);
  assert.match(appSource, /apiPreviewNotesExtraction\(sid, payload\)/);
  assert.match(appSource, /onPreviewNotesExtraction=\{previewNotesExtraction\}/);
  assert.match(notesPanelSource, /async function previewGlobalNotesExtraction\(\)/);
  assert.match(notesPanelSource, /onPreviewNotesExtraction\?\.\(t\)/);
  assert.match(notesPanelSource, /setNotesExtractionPreview\(rr\?\.preview \|\| rr\?\.result \|\| rr \|\| null\)/);
});

test("notes extraction preview panel is explicit preview-only UI", () => {
  assert.match(notesContentSource, /Предпросмотр разбора/);
  assert.match(notesContentSource, /Это предпросмотр\. Изменения ещё не применены\./);
  assert.match(notesContentSource, /data-testid="notes-extraction-preview-button"/);
  assert.match(notesContentSource, /data-testid="notes-extraction-preview-panel"/);
  assert.match(notesContentSource, /candidate_roles/);
  assert.match(notesContentSource, /candidate_start_role/);
  assert.match(notesContentSource, /candidate_nodes/);
  assert.match(notesContentSource, /candidate_edges/);
  assert.match(notesContentSource, /candidate_questions/);
  assert.match(notesContentSource, /warnings/);
  assert.match(notesContentSource, /input_hash/);
});

test("preview action does not call the legacy notes apply flow", () => {
  const previewFn = notesPanelSource.match(/async function previewGlobalNotesExtraction\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.ok(previewFn, "previewGlobalNotesExtraction source must be present");
  assert.equal(/onAddNote|sendGlobalNote|apiPostNote|setDraftPersisted/.test(previewFn), false);
  assert.match(notesContentSource, /data-testid="notes-extraction-apply-button"/);
});

test("notes extraction apply action is explicit selected-candidate flow", () => {
  assert.match(appSource, /apiApplyNotesExtraction/);
  assert.match(appSource, /async function applyNotesExtraction\(payload = \{\}\)/);
  assert.match(appSource, /apiApplyNotesExtraction\(sid, body\)/);
  assert.match(appSource, /onSessionSync\(\{\s*\.\.\.sessionFromResp,[\s\S]*?_sync_source: "notes_extraction_apply"/);
  assert.match(appSource, /onApplyNotesExtraction=\{applyNotesExtraction\}/);
  assert.match(notesPanelSource, /async function applyGlobalNotesExtractionSelection\(payload\)/);
  assert.match(notesPanelSource, /onApplyNotesExtraction\?\.\(body\)/);
  assert.match(notesContentSource, /Применить выбранное/);
  assert.match(notesContentSource, /Выберите хотя бы один candidate для применения\./);
  assert.match(notesContentSource, /Изменения применены к процессу/);
  assert.match(notesContentSource, /Версия диаграммы изменилась\. Обновите предпросмотр и повторите применение\./);
  assert.match(notesContentSource, /base_diagram_state_version: baseDiagramStateVersion/);
  assert.match(notesContentSource, /apply_notes: selected\.notes === true/);
  assert.match(notesContentSource, /apply_roles: applyRoles/);
  assert.match(notesContentSource, /apply_nodes_edges: applyNodesEdges/);
  assert.match(notesContentSource, /apply_questions: selectedQuestions\.length > 0/);
  assert.match(notesContentSource, /disabled=\{!!disabled \|\| applyBusy \|\| !hasSelection \|\| !onApplyNotesExtraction\}/);
});

test("apply action does not call preview or legacy notes endpoint", () => {
  const applyFn = notesPanelSource.match(/async function applyGlobalNotesExtractionSelection\(payload\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.ok(applyFn, "applyGlobalNotesExtractionSelection source must be present");
  assert.equal(/onAddNote|sendGlobalNote|apiPostNote|apiPreviewNotesExtraction|onPreviewNotesExtraction/.test(applyFn), false);

  const submitApplyFn = notesContentSource.match(/const submitApply = async \(\) => \{[\s\S]*?\n  \};/)?.[0] || "";
  assert.ok(submitApplyFn, "submitApply source must be present");
  assert.equal(/onPreviewNotesExtraction|apiPreviewNotesExtraction|apiPostNote|executeAi/.test(submitApplyFn), false);
});
