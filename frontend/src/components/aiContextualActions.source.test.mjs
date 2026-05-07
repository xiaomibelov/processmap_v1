import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("contextual AI actions remain in session create, analysis, timeline and reports", () => {
  const sessionCreate = readSource("src/components/SessionFlowModal.jsx");
  assert.match(sessionCreate, /apiSessionTitleQuestions/);
  assert.match(sessionCreate, /AI-вопросы для первого интервью/);

  const interviewStage = readSource("src/components/process/InterviewStage.jsx");
  assert.match(interviewStage, /data-testid="interview-selected-open-ai"/);
  assert.match(interviewStage, /data-testid="interview-selected-generate-ai"/);

  const timeline = readSource("src/components/process/interview/TimelineTable.jsx");
  assert.match(timeline, /data-testid="interview-step-ai-badge"/);
  assert.match(timeline, /AI-вопросы/);

  const reports = readSource("src/components/process/interview/paths/ReportsDrawer.jsx");
  assert.match(reports, /data-testid="interview-path-report-panel"/);
});
