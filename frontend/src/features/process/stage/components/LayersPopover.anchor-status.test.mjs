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
  assert.match(source, /anchored \{Number\(drawioAnchorSummary\.anchored \|\| 0\)\}/);
  assert.match(source, /orphaned \{Number\(drawioAnchorSummary\.orphaned \|\| 0\)\}/);
  assert.match(source, /invalid \{Number\(drawioAnchorSummary\.invalid \|\| 0\)\}/);
  assert.match(source, /ожидает BPMN hydrate/);
});

test("LayersPopover surfaces import impact review controls for affected anchors", () => {
  assert.match(source, /Last BPMN import/);
  assert.match(source, /anchors affected/);
  assert.match(source, /diagram-action-layers-import-affected-toggle/);
  assert.match(source, /Показать affected anchors/);
  assert.match(source, /setDrawioSelectedElementId\?\.\(entityId\)/);
});
