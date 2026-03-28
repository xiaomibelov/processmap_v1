import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "LayersPopover.jsx"), "utf8");

test("LayersPopover exposes explicit anchor state, target, and recovery actions", () => {
  assert.match(source, /diagram-action-layers-selected-anchor-status/);
  assert.match(source, /diagram-action-layers-selected-anchor-target/);
  assert.match(source, /diagram-action-layers-selected-anchor-apply/);
  assert.match(source, /diagram-action-layers-selected-anchor-clear/);
  assert.match(source, /diagram-action-layers-selected-anchor-focus/);
});

test("LayersPopover surfaces aggregate anchor counts and deferred validation note", () => {
  assert.match(source, /anch \{Number\(drawioAnchorSummary\.anchored \|\| 0\)\}/);
  assert.match(source, /orph \{Number\(drawioAnchorSummary\.orphaned \|\| 0\)\}/);
  assert.match(source, /inv \{Number\(drawioAnchorSummary\.invalid \|\| 0\)\}/);
  assert.match(source, /ожидает BPMN hydrate/);
});

test("LayersPopover surfaces import impact review controls for affected anchors", () => {
  assert.match(source, /Last import/);
  assert.match(source, /Affected anchors/);
  assert.match(source, /diagram-action-layers-import-affected-toggle/);
  assert.match(source, /showImportAffectedOnly \? "Все overlay" : "Affected anchors"/);
  assert.match(source, /setDrawioSelectedElementId\?\.\(entityId\)/);
});

test("LayersPopover derives sticky-note mode from canonical drawio row", () => {
  assert.match(source, /const selectedDrawioCanonicalRow = useMemo/);
  assert.match(source, /drawioState\?\.drawio_elements_v1/);
  assert.match(source, /const selectedDrawioRuntimeRow = useMemo/);
  assert.match(source, /selectedDrawioIsNote = selectedIsDrawio && toText\(selectedDrawioRuntimeRow\.type\)\.toLowerCase\(\) === "note"/);
});
