import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const controlsSource = fs.readFileSync(
  new URL("./ProcessStageDiagramControls.jsx", import.meta.url),
  "utf8",
);
const sectionsSource = fs.readFileSync(
  new URL("../orchestration/buildDiagramControlsSections.js", import.meta.url),
  "utf8",
);

test("ProcessStageDiagramControls overflow menu exposes Align and Reset canvas actions", () => {
  assert.match(controlsSource, /data-testid="diagram-action-align-diagram"/);
  assert.match(controlsSource, /data-testid="diagram-action-reset-canvas"/);
  assert.match(controlsSource, /Выровнять схему/);
  assert.match(controlsSource, /Reset/);
  assert.match(controlsSource, /onAlignDiagram\?\.\(\)/);
  assert.match(controlsSource, /onResetCanvas\?\.\(\)/);
});

test("buildDiagramControlsSections forwards onAlignDiagram and onResetCanvas", () => {
  assert.match(sectionsSource, /"onAlignDiagram"/);
  assert.match(sectionsSource, /"onResetCanvas"/);
  assert.match(sectionsSource, /OVERFLOW_MODES_KEYS/);
});
