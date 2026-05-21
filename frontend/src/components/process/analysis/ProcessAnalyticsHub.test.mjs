import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "ProcessAnalyticsHub.jsx"), "utf8");
const processStageSource = fs.readFileSync(path.join(__dirname, "../../ProcessStage.jsx"), "utf8");
const routeModelSource = fs.readFileSync(path.join(__dirname, "../../../app/processMapRouteModel.js"), "utf8");
const explorerSource = fs.readFileSync(path.join(__dirname, "../../../features/explorer/WorkspaceExplorer.jsx"), "utf8");
const appShellSource = fs.readFileSync(path.join(__dirname, "../../AppShell.jsx"), "utf8");
const topBarSource = fs.readFileSync(path.join(__dirname, "../../TopBar.jsx"), "utf8");
const cssSource = fs.readFileSync(path.join(__dirname, "../../../styles/tailwind.css"), "utf8");
const versionSource = fs.readFileSync(path.join(__dirname, "../../../config/appVersion.js"), "utf8");

test("ProcessAnalyticsHub component renders page wrapper with correct testid", () => {
  assert.equal(source.includes('"data-testid": "process-analytics-hub-page"'), true);
  assert.equal(source.includes('processAnalyticsHubPage'), true);
});

test("ProcessAnalyticsHub title and description are present", () => {
  assert.equal(source.includes("Аналитика"), true);
  assert.equal(source.includes("Сводная аналитика по процессам, действиям, свойствам и источникам данных."), true);
});

test("ProcessAnalyticsHub module cards are present with correct labels and badges", () => {
  assert.equal(source.includes("Реестр действий"), true);
  assert.equal(source.includes("Реестр свойств"), true);
  assert.equal(source.includes("Дашборды"), true);
  assert.equal(source.includes("Экспорт"), true);
  assert.equal(source.includes('"analytics-hub-module-registry"'), true);
  assert.equal(source.includes('"analytics-hub-module-properties"'), true);
  assert.equal(source.includes('"analytics-hub-module-dashboards"'), true);
  assert.equal(source.includes('"analytics-hub-module-export"'), true);
  assert.equal(source.includes("Открыть"), true);
  assert.equal(source.includes("Скоро"), true);
  assert.equal(source.includes("В разработке"), true);
});

test("ProcessAnalyticsHub close button is present", () => {
  assert.equal(source.includes('"analytics-hub-close"'), true);
  assert.equal(source.includes("Закрыть"), true);
});

test("ProcessAnalyticsHub onOpenProductActionsRegistry wiring is present", () => {
  assert.equal(source.includes("onOpenProductActionsRegistry"), true);
  assert.equal(source.includes('"analytics-hub-open-registry"'), true);
  assert.equal(source.includes("Открыть"), true);
});

test("ProcessAnalyticsHub onClose wiring is present", () => {
  assert.equal(source.includes("onClose"), true);
});

test("ProcessAnalyticsHub summary cards show neutral placeholder without fake numbers", () => {
  assert.equal(source.includes("summaryValue"), true);
  assert.equal(source.includes("—"), true);
  const cleaned = source.replace(/"[^"]*"/g, "");
  assert.equal(/\d+/.test(cleaned), false, "no raw numbers as fake data");
});

test("route model exposes analytics hub helpers", () => {
  assert.match(routeModelSource, /export const ANALYTICS_HUB_SURFACE = "analytics";/);
  assert.match(routeModelSource, /export function readAnalyticsHubRoute/);
  assert.match(routeModelSource, /export function buildAnalyticsHubUrl/);
  assert.match(routeModelSource, /export function buildAnalyticsHubCloseUrl/);
});

test("ProcessStage wires analytics hub route and component", () => {
  assert.match(processStageSource, /import ProcessAnalyticsHub from "\.\/process\/analysis\/ProcessAnalyticsHub\.jsx"/);
  assert.match(processStageSource, /readAnalyticsHubRoute/);
  assert.match(processStageSource, /buildAnalyticsHubUrl/);
  assert.match(processStageSource, /buildAnalyticsHubCloseUrl/);
  assert.match(processStageSource, /analyticsHubRoute/);
  assert.match(processStageSource, /openAnalyticsHub/);
  assert.match(processStageSource, /closeAnalyticsHub/);
  assert.match(processStageSource, /ProcessAnalyticsHub/);
  assert.match(processStageSource, /onOpenAnalyticsHub/);
});

test("WorkspaceExplorer exposes analytics hub navigation buttons", () => {
  assert.match(explorerSource, /onOpenAnalyticsHub/);
  assert.match(explorerSource, /data-testid="workspace-analytics-hub-nav"/);
  assert.match(explorerSource, /data-testid="project-analytics-hub"/);
  assert.match(explorerSource, /Аналитика/);
});

test("AppShell detects analytics surface", () => {
  assert.match(appShellSource, /isAnalyticsSurface/);
  assert.match(appShellSource, /analyticsSurfaceActive/);
});

test("TopBar handles analytics surface", () => {
  assert.match(topBarSource, /analyticsSurfaceActive/);
  assert.match(topBarSource, /data-testid="topbar-analytics-label"/);
  assert.match(topBarSource, /Аналитика/);
});

test("CSS defines analytics hub scoped classes", () => {
  assert.match(cssSource, /\.processAnalyticsHubPage/);
  assert.match(cssSource, /\.processAnalyticsHubHeader/);
  assert.match(cssSource, /\.processAnalyticsHubSummaryCards/);
  assert.match(cssSource, /\.processAnalyticsHubModuleCards/);
  assert.match(cssSource, /\.processAnalyticsHubModuleCard/);
});

test("version changelog keeps analytics hub entry and current marker", () => {
  assert.match(versionSource, /currentVersion: "v1\.0\.137"/);
  assert.match(versionSource, /version: "v1\.0\.137"/);
  assert.match(versionSource, /Создан верхнеуровневый раздел Аналитика \(Analytics Hub\)\./);
  assert.match(versionSource, /Реестр действий с продуктом теперь доступен как модуль внутри Аналитики\./);
});
