import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "InterviewStage.jsx"), "utf8");

test("InterviewStage renders ProductActionsPanel in the normal Analysis section before mode-specific views", () => {
  const panelIndex = source.indexOf("<ProductActionsPanel");
  const diagramModeIndex = source.indexOf('{timelineViewMode === "diagram"');
  const pathsModeIndex = source.indexOf('{timelineViewMode === "paths"');
  const matrixModeIndex = source.indexOf('{timelineViewMode === "matrix"');
  const transitionsIndex = source.indexOf("<TransitionsBlock");

  assert.notEqual(panelIndex, -1, "ProductActionsPanel must be rendered by InterviewStage");
  assert.ok(panelIndex < diagramModeIndex, "ProductActionsPanel must appear before diagram subview");
  assert.ok(panelIndex < pathsModeIndex, "ProductActionsPanel must appear before routes/scenarios subview");
  assert.ok(panelIndex < matrixModeIndex, "ProductActionsPanel must appear before matrix table subview");
  assert.ok(panelIndex < transitionsIndex, "ProductActionsPanel must appear above B2/routes/summary blocks");
  assert.equal(/timelineViewMode === "matrix"[\s\S]{0,160}<ProductActionsPanel/.test(source), false);
});
