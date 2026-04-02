import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const controlsSource = fs.readFileSync(path.join(__dirname, "ElementSettingsControls.jsx"), "utf8");
const notesPanelSource = fs.readFileSync(path.join(__dirname, "..", "NotesPanel.jsx"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "..", "..", "App.jsx"), "utf8");
const processStageSource = fs.readFileSync(path.join(__dirname, "..", "ProcessStage.jsx"), "utf8");

test("BPMN-side properties surface overlay companion awareness in the selected-node properties block", () => {
  assert.match(controlsSource, /data-testid="bpmn-overlay-companions-block"/);
  assert.match(controlsSource, /Overlay companions/);
  assert.match(controlsSource, /Показать в overlay/);
  assert.match(controlsSource, /bpmn-overlay-companions-toggle/);
  assert.match(controlsSource, /Invalid companions показаны первыми/);
});

test("NotesPanel derives BPMN-side companion summary from drawio anchor truth only", () => {
  assert.match(notesPanelSource, /buildBpmnNodeOverlayCompanionSummary/);
  assert.match(notesPanelSource, /applyDrawioAnchorValidation/);
  assert.match(notesPanelSource, /selectedBpmnOverlayCompanionSummary/);
});

test("App and ProcessStage bridge BPMN-side companion focus into draw.io selection as transient intent", () => {
  assert.match(appSource, /drawioCompanionFocusIntent/);
  assert.match(appSource, /onFocusDrawioCompanion/);
  assert.match(processStageSource, /drawioCompanionFocusIntent/);
  assert.match(processStageSource, /setDrawioSelectedElementId\(objectId\)/);
  assert.match(processStageSource, /setDiagramActionLayersOpen\(true\)/);
});
