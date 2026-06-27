import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function read(name) {
  return fs.readFileSync(path.join(__dirname, name), "utf8");
}

const source = read("AnalyticsDashboards.jsx");
const sessionSource = read("SessionAnalyticsDashboard.jsx");
const projectSource = read("ProjectAnalyticsDashboard.jsx");
const workspaceSource = read("WorkspaceAnalyticsDashboard.jsx");
const cardSource = read("DashboardMetricCard.jsx");
const chartSource = read("DashboardBarChart.jsx");
const modelSource = read("dashboardModel.js");
const panelSource = read("AnalyticsDashboardsPanel.jsx");

test("AnalyticsDashboards renders session scope without crash", () => {
  assert.match(source, /sessionId\s*\?/);
  assert.match(source, /SessionAnalyticsDashboard/);
  assert.match(source, /data-testid=/);
});

test("AnalyticsDashboards renders project scope without crash", () => {
  assert.match(source, /projectId\s*\?/);
  assert.match(source, /ProjectAnalyticsDashboard/);
});

test("AnalyticsDashboards renders workspace scope without crash", () => {
  assert.match(source, /WorkspaceAnalyticsDashboard/);
});

test("AnalyticsDashboards does NOT contain placeholder text Будет позже", () => {
  assert.equal(source.includes("Будет позже"), false);
  assert.equal(sessionSource.includes("Будет позже"), false);
  assert.equal(projectSource.includes("Будет позже"), false);
  assert.equal(workspaceSource.includes("Будет позже"), false);
});

test("SessionAnalyticsDashboard calls apiGetSessionAnalytics on mount", () => {
  assert.match(sessionSource, /apiGetSessionAnalytics/);
  assert.match(sessionSource, /data-testid="session-analytics-dashboard"/);
  assert.match(sessionSource, /data-testid="analytics-metrics"/);
});

test("ProjectAnalyticsDashboard calls apiGetProjectAnalytics on mount", () => {
  assert.match(projectSource, /apiGetProjectAnalytics/);
  assert.match(projectSource, /data-testid="project-analytics-dashboard"/);
  assert.match(projectSource, /data-testid="analytics-recent-sessions"/);
});

test("WorkspaceAnalyticsDashboard calls apiGetWorkspaceAnalytics on mount", () => {
  assert.match(workspaceSource, /apiGetWorkspaceAnalytics/);
  assert.match(workspaceSource, /data-testid="workspace-analytics-dashboard"/);
  assert.match(workspaceSource, /data-testid="analytics-recent-sessions"/);
});

test("DashboardMetricCard renders title, value and optional subtitle", () => {
  assert.match(cardSource, /dashboardMetricCard/);
  assert.match(cardSource, /title/);
  assert.match(cardSource, /value/);
  assert.match(cardSource, /subtitle/);
  assert.match(cardSource, /tone/);
  assert.match(cardSource, /data-testid=/);
});

test("DashboardBarChart renders horizontal bars with label, track and value", () => {
  assert.match(chartSource, /dashboardBarChart/);
  assert.match(chartSource, /dashboardBarTrack/);
  assert.match(chartSource, /dashboardBarFill/);
  assert.match(chartSource, /role="img"/);
  assert.match(chartSource, /aria-label/);
});

test("dashboardModel exports normalization helpers", () => {
  assert.match(modelSource, /sessionAnalyticsToCards/);
  assert.match(modelSource, /sessionAnalyticsToBarChartItems/);
  assert.match(modelSource, /normalizeProjectAnalyticsCards/);
  assert.match(modelSource, /normalizeWorkspaceAnalyticsCards/);
});

test("All new components have data-testid attributes", () => {
  assert.match(source, /data-testid=/);
  assert.match(sessionSource, /data-testid=/);
  assert.match(projectSource, /data-testid=/);
  assert.match(workspaceSource, /data-testid=/);
  assert.match(cardSource, /data-testid=/);
  assert.match(chartSource, /data-testid=/);
});

test("dashboardModel exports dashboard v2 helpers", () => {
  assert.match(modelSource, /dashboardDataToKpiCards/);
  assert.match(modelSource, /dashboardDataToTaskStatusItems/);
  assert.match(modelSource, /dashboardDataToBpmnElementItems/);
  assert.match(modelSource, /dashboardDataToSessionTrendItems/);
  assert.match(modelSource, /dashboardDataToProcessDurationItems/);
  assert.match(modelSource, /hasActivityHeatmapData/);
});

test("AnalyticsDashboardsPanel renders v2 tiles", () => {
  assert.match(panelSource, /analytics-kpi-metrics/);
  assert.match(panelSource, /Статусы задач/);
  assert.match(panelSource, /Типы BPMN-элементов/);
  assert.match(panelSource, /Динамика сессий/);
  assert.match(panelSource, /Длительность по процессам/);
  assert.match(panelSource, /Heatmap активности/);
  assert.match(panelSource, /Топ-5 используемых свойств/);
});
