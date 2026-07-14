// Source-text assertions for the To-Be builder wiring in NotesPanel
// (property-panel-redesign, Phase 2). Covers AC6 (live preview), AC7/AC8
// (To-Be builder: derived model, add-from-pool into the draft, removed
// tracking on property delete) — UI.md §3 interaction map.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./NotesPanel.jsx", import.meta.url), "utf8");

test("NotesPanel imports and mounts LiveCardPreview + ToBeBuilder", () => {
  assert.match(source, /import LiveCardPreview from "\.\/sidebar\/displaySettings\/LiveCardPreview"/);
  assert.match(source, /import ToBeBuilder from "\.\/sidebar\/displaySettings\/ToBeBuilder"/);
  assert.match(source, /<LiveCardPreview/);
  assert.match(source, /<ToBeBuilder/);
});

test("To-Be state is per-session and derived from element + dictionary names", () => {
  assert.match(source, /useToBeState\(sid\)/);
  assert.match(source, /deriveToBeModel\(\{/);
  assert.match(source, /asIsNames: selectedElementPropertyNames/);
  assert.match(source, /dictionaryNames: dictionaryPropertyNames/);
});

test("live preview comes from the overlay preview hook (draft, no save)", () => {
  assert.match(source, /overlayPreview,/);
  assert.match(source, /preview=\{overlayPreview\}/);
});

test("Pool '+' appends a draft property row (draft-only, persists on global Save)", () => {
  assert.match(source, /addPropertyFromPool/);
  assert.match(source, /onAddFromPool=\{addPropertyFromPool\}/);
  assert.match(source, /prop_draft_\$\{Date\.now\(\)\}/);
  assert.match(source, /updateCamundaPropertiesDraft\(/);
});

test("deleting a configured To-Be property marks it Removed (per element)", () => {
  assert.match(source, /markRemoved/);
  assert.match(source, /onToggleToBe=\{toggleToBe\}/);
  // removal detection is scoped: names that disappear while the SAME element
  // stays selected are marked; element switches only re-baseline.
  assert.match(source, /prev\.elementId === selectedElementId/);
});
