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

test("process workbench uses user-facing analysis/output tab labels", () => {
  const source = read("src/features/process/processWorkbench.config.js");
  assert.match(source, /\{ id: "interview", label: "Анализ процессов" \}/);
  assert.match(source, /\{ id: "diagram", label: "Diagram \(BPMN\)" \}/);
  assert.match(source, /\{ id: "doc", label: "DOC" \}/);
  assert.match(source, /\{ id: "dod", label: "DOD" \}/);
});

test("interview primary blocks open by default without changing saved model", () => {
  const source = read("src/components/process/interview/useInterviewSessionState.js");
  assert.match(source, /boundaries: false,[\s\S]*timeline: false,[\s\S]*summary: false,/);
  assert.match(source, /setCollapsed\(\{[\s\S]*boundaries: false,[\s\S]*timeline: false,[\s\S]*summary: false,/);
  assert.doesNotMatch(source, /analysis\.product_actions|product_actions|product_group|product_name/);
});

test("timeline keeps matrix primary and moves graph paths diagnostics under advanced controls", () => {
  const source = read("src/components/process/interview/TimelineControls.jsx");
  assert.match(source, /data-testid="interview-advanced-toggle"/);
  assert.match(source, /Дополнительно · \{activeViewLabel\}/);
  assert.match(source, /data-testid="interview-advanced-controls"/);
  assert.match(source, />\s*Таблица шагов\s*</);
  assert.match(source, />\s*Сценарии и отчёты\s*</);
  assert.match(source, />\s*Граф анализа\s*</);
  assert.match(source, />\s*Проверка привязок/);
  assert.match(source, />\s*Диагностика\s*</);
});

test("summary and reports frame output and hide diagnostics behind details", () => {
  const summary = read("src/components/process/interview/SummaryBlock.jsx");
  const reports = read("src/components/process/interview/paths/ReportsDrawer.jsx");
  assert.match(summary, /C\. Итоги и время/);
  assert.match(summary, /<details className="interviewAdvancedDetails">/);
  assert.match(summary, /Дополнительно: распределения, AI и диагностика покрытия/);
  assert.match(reports, /Результат анализа, не источник процесса/);
  assert.match(reports, /Диагностика генерации:/);
  assert.match(reports, /Технические сведения версии/);
  assert.match(reports, /Диагностика отчёта/);
});

test("analysis step block is structured as primary workspace plus secondary scenarios", () => {
  const source = read("src/components/process/InterviewStage.jsx");
  const styles = read("src/styles/tailwind.css");
  assert.match(source, /data-testid="analysis-step-actions-section"/);
  assert.match(source, /data-testid="analysis-step-workspace"/);
  assert.match(source, /data-testid="analysis-b-steps-section"/);
  assert.match(source, /data-testid="analysis-b-context-section"/);
  assert.match(source, /data-testid="analysis-step-table-card"/);
  assert.match(source, /data-testid="analysis-step-companion"/);
  assert.match(source, /data-testid="analysis-selected-step-card"/);
  assert.match(source, /data-testid="analysis-secondary-panel"/);
  assert.match(source, /B\. Действия процесса/);
  assert.doesNotMatch(source, /Основная рабочая зона анализа/);
  assert.doesNotMatch(source, /Сценарии и отчёты открыты ниже/);
  assert.doesNotMatch(source, /Таблица шагов остаётся основой анализа/);
  assert.match(source, /compact/);
  assert.match(source, /showStepContext=\{false\}/);
  assert.match(source, /Дополнительно · Сценарии и отчёты/);
  assert.match(source, /<details className="analysisBSection analysisSecondaryPanel" data-testid="analysis-secondary-panel">/);
  assert.match(source, /ProductActionsPanel/);
  assert.match(styles, /\.analysisStepCompanion\s*\{[\s\S]*position: sticky;/);
  assert.match(styles, /\.analysisStepCompanion\s*\{[\s\S]*max-height: min\(600px, calc\(100vh - 220px\)\);/);
  assert.match(styles, /--analysis-surface: hsl\(var\(--panel\) \/ 0\.9\);/);
  assert.doesNotMatch(styles, /\.analysisStepBlock\s*\{[\s\S]*background: rgba\(15, 23, 42, 0\.62\);/);
});

test("app version changelog records the UI surface simplification", () => {
  const source = read("src/config/appVersion.js");
  assert.match(source, /currentVersion: "v1\.0\.110"/);
  assert.match(source, /Улучшена рабочая зона действий процесса и светлая тема анализа\./);
});
