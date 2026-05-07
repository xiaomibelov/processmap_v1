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
  assert.match(notesContentSource, /Применение будет добавлено отдельным контуром\./);
  assert.match(notesContentSource, /Применение будет доступно после apply-boundary контура\./);
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
  assert.match(notesContentSource, /<button type="button" className="secondaryBtn h-8 px-2\.5 text-\[11px\]" disabled>/);
});
