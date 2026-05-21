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
  assert.ok(panelIndex < transitionsIndex, "ProductActionsPanel must appear above B2/routes/summary blocks");
  assert.equal(/timelineViewMode === "matrix"[\s\S]{0,160}<ProductActionsPanel/.test(source), false);
});

test("InterviewStage loads session analysis view model and uses step_action_counts", () => {
  assert.match(source, /apiGetSessionAnalysisViewModel/);
  assert.match(source, /sessionAnalysisViewModel/);
  assert.match(source, /sessionAnalysisViewModel\?\.analysis\?\.derived\?\.step_action_counts/);
  assert.match(source, /productActionCountByStepId/);
  assert.equal(/useMemo\(\s*\(\) => countProductActionsForStep\(data\?\.analysis, analysisContextStep\)/.test(source), false);
  assert.equal(/useMemo\(\s*\(\) => \{\s*const map = \{\};\s*const steps = Array\.isArray\(timelineView\) \? timelineView : \[\];\s*steps\.forEach\(\(step\) => \{\s*const stepId = toText\(step\?\.id\);\s*if \(!stepId\) return;\s*map\[stepId\] = countProductActionsForStep\(data\?\.analysis, step\);/.test(source), false);
});

test("InterviewStage preserves fallback to client-side count when view model is absent", () => {
  assert.match(source, /countProductActionsForStep\(data\?\.analysis, analysisContextStep\)/);
  assert.match(source, /countProductActionsForStep\(data\?\.analysis, step\)/);
  assert.match(source, /sessionAnalysisViewModel\?\.analysis\?\.derived\?\.step_action_counts/);
  assert.match(source, /const hasVm = sessionAnalysisViewModel && vmCounts && typeof vmCounts === "object"/);
});
