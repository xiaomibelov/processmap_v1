import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./NotesPanel.jsx", import.meta.url), "utf8");

test("NotesPanel renders compact PropertyDisplaySettings (2 dropdowns + chips)", () => {
  assert.match(source, /import PropertyDisplaySettings from "\.\/sidebar\/displaySettings\/PropertyDisplaySettings"/);
  assert.match(source, /<PropertyDisplaySettings/);
  assert.match(source, /chips=\{fieldChips\}/);
  assert.match(source, /onDisplayModeChange=\{onOverlayDisplayModeChange\}/);
  assert.match(source, /onV2ModeChange=\{onOverlayV2ModeChange\}/);
  assert.match(source, /onToggleField=\{onOverlayFieldToggle\}/);
});

test("NotesPanel builds field chips from element + dictionary + quick names", () => {
  assert.match(source, /buildFieldChips\(\{/);
  assert.match(source, /elementPropertyNames/);
  assert.match(source, /dictionaryNames/);
  assert.match(source, /DEFAULT_QUICK_PROPERTY_NAMES/);
});

test("NotesPanel threads hiddenFields into the overlay preview hook", () => {
  assert.match(source, /hiddenFields:\s*overlayDisplaySettings\?\.hiddenFields/);
});

test("NotesPanel drops the five legacy overlay checkboxes and per-element flag writer", () => {
  assert.doesNotMatch(source, /sidebarPropertiesInlineToggle/);
  assert.doesNotMatch(source, /bpmn-show-properties-checkbox/);
  assert.doesNotMatch(source, /bpmn-show-properties-per-element-checkbox/);
  assert.doesNotMatch(source, /bpmn-show-v2-overlays-checkbox/);
  assert.doesNotMatch(source, /setShowPropertiesFlag/);
  assert.doesNotMatch(source, /localShowPropertiesOverlayOnSelect/);
});
