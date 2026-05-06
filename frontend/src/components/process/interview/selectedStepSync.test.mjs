import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../../..");

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

test("analysis row clicks own the step shown in the product companion panel", () => {
  const stage = read("src/components/process/InterviewStage.jsx");
  assert.match(stage, /const \[analysisActiveStepId, setAnalysisActiveStepId\] = useState\(""\);/);
  assert.match(stage, /function handleActivateAnalysisStep\(stepId\)/);
  assert.match(stage, /setAnalysisActiveStepId\(key\);/);
  assert.match(stage, /const analysisActiveStep = useMemo/);
  assert.match(stage, /const analysisContextStep = analysisActiveStep \|\| selectedStep/);
  assert.match(stage, /activeAnalysisStepId=\{analysisContextStepIds\[0\] \|\| ""\}/);
  assert.match(stage, /onActivateStep=\{handleActivateAnalysisStep\}/);
  assert.match(stage, /selectedStepIds=\{analysisContextStepIds\}/);
});

test("timeline rows notify InterviewStage before the companion panel can become stale", () => {
  const timeline = read("src/components/process/interview/TimelineTable.jsx");
  const styles = read("src/styles/tailwind.css");
  assert.match(timeline, /activeAnalysisStepId = ""/);
  assert.match(timeline, /onActivateStep/);
  assert.match(timeline, /const activeAnalysisRow = toText\(activeAnalysisStepId\) === stepId;/);
  assert.match(timeline, /const activateStepRow = \(\) => \{[\s\S]*onActivateStep\?\.\(stepId\);[\s\S]*\};/);
  assert.match(timeline, /onMouseDown=\{activateStepRow\}/);
  assert.match(timeline, /onFocusCapture=\{activateStepRow\}/);
  assert.match(timeline, /activeAnalysisRow \? "isAnalysisActive" : ""/);
  assert.match(styles, /\.analysisStepListTable \.analysisStepListRow\.isAnalysisActive td/);
});
