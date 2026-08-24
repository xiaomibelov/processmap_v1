import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "InterviewStage.jsx"), "utf8");

test("InterviewStage renders ProductActionsPanel inside the steps tab companion", () => {
  const panelIndex = source.indexOf("<ProductActionsPanel");
  assert.notEqual(panelIndex, -1, "ProductActionsPanel must be rendered by InterviewStage");

  const companionStart = source.indexOf("const stepsTabCompanion =");
  const companionEnd = source.indexOf("const stepsTabSecondaryPanel");
  assert.notEqual(companionStart, -1, "stepsTabCompanion must be defined");
  assert.ok(
    panelIndex > companionStart && (companionEnd === -1 || panelIndex < companionEnd),
    "ProductActionsPanel must be rendered inside stepsTabCompanion"
  );

  const stepsTabIndex = source.indexOf('key: "steps"');
  assert.notEqual(stepsTabIndex, -1, "steps tab must be defined");
  assert.ok(
    stepsTabIndex < source.indexOf("{stepsTabCompanion}", stepsTabIndex),
    "stepsTabCompanion must be rendered inside the steps tab"
  );
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
