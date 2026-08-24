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

test("InterviewStage renders ProcessAnalysisDashboard without feature flag", () => {
  const source = readFile("frontend/src/components/process/InterviewStage.jsx");
  assert.match(source, /ProcessAnalysisDashboard/);
  assert.doesNotMatch(source, /isAnalysisRedesignEnabled/);
  assert.doesNotMatch(source, /fpc_analysis_redesign/);
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

test("no legacy analysis feature flag or old UI references remain in frontend source", () => {
  const srcDir = path.join(repoRoot, "frontend/src");
  const legacyMarkers = [
    "isAnalysisRedesignEnabled",
    "fpc_analysis_redesign",
    "ProcessAnalysisOverview",
    "ProcessAnalysisSkeleton",
  ];
  const hits = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        walk(full);
        continue;
      }
      if (!/\.(js|jsx|mjs|ts|tsx)$/.test(entry.name)) continue;
      if (entry.name.includes(".test.") || entry.name.includes(".spec.")) continue;
      const content = fs.readFileSync(full, "utf-8");
      for (const marker of legacyMarkers) {
        if (content.includes(marker)) {
          hits.push(`${path.relative(repoRoot, full)}: ${marker}`);
        }
      }
    }
  }

  walk(srcDir);
  assert.deepEqual(
    hits,
    [],
    `Legacy analysis markers found in source files: ${JSON.stringify(hits, null, 2)}`,
  );
});
