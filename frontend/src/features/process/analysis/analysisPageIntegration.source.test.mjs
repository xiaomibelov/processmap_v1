import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, "frontend/src/components/process/InterviewStage.jsx");
    if (fs.existsSync(candidate)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, "../../../..");
}

const repoRoot = findRepoRoot(__dirname);

function readFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf-8");
}

test("InterviewStage imports ProcessAnalysisDashboard behind feature flag", () => {
  const source = readFile("frontend/src/components/process/InterviewStage.jsx");
  assert.match(source, /ProcessAnalysisDashboard/);
  assert.match(source, /isAnalysisRedesignEnabled/);
  assert.match(source, /fpc_analysis_redesign/);
});

test("ProcessAnalysisDashboard uses backend read-model and renders tabs via ProcessAnalysisPage", () => {
  const source = readFile("frontend/src/features/process/analysis/ProcessAnalysisDashboard.jsx");
  assert.match(source, /useProcessAnalysisViewModel/);
  assert.match(source, /ProcessAnalysisPage/);
  assert.doesNotMatch(source, /ProcessAnalysisOverview/);
  assert.doesNotMatch(source, /ProcessAnalysisSkeleton/);
});

test("InterviewStage constructs six original-section tabs for redesign", () => {
  const source = readFile("frontend/src/components/process/InterviewStage.jsx");
  assert.match(source, /key:\s*"boundaries"/);
  assert.match(source, /key:\s*"steps"/);
  assert.match(source, /key:\s*"branches"/);
  assert.match(source, /key:\s*"summary"/);
  assert.match(source, /key:\s*"exceptions"/);
  assert.match(source, /key:\s*"ai"/);
  assert.match(source, /defaultTabKey="steps"/);
  assert.match(source, /ProcessAnalysisSummaryTab/);
  assert.match(source, /analysis\.tabs\./);
});

test("apiGetSessionAnalysisViewModel exposes process_metrics", () => {
  const source = readFile("frontend/src/lib/api.js");
  assert.match(source, /process_metrics/);
});

test("read-model service exists and is pure function of session", () => {
  const source = readFile("backend/app/services/process_analysis_read_model.py");
  assert.match(source, /def build_session_process_analysis/);
  assert.match(source, /process_analysis_read_model/);
});

test("no arithmetic on frontend for metrics in analysis model", () => {
  const source = readFile("frontend/src/features/process/analysis/processAnalysisModel.js");
  assert.doesNotMatch(source, /\+\s*60|\*\s*60|\/\s*60/);
});
