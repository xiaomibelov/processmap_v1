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
  assert.equal(source.includes('data-testid="process-analytics-hub-page"'), true);
  assert.equal(source.includes('processAnalyticsHubPage'), true);
});

test("ProcessAnalyticsHub title and description are present", () => {
  assert.equal(source.includes("Аналитика"), true);
  assert.equal(source.includes("Единая точка входа для реестров и будущих аналитических панелей."), true);
});

test("ProcessAnalyticsHub module cards are present with correct labels and badges", () => {
  assert.equal(source.includes("Реестр действий"), true);
  assert.equal(source.includes("Реестр свойств"), true);
  assert.equal(source.includes("Дашборды"), true);
  assert.equal(source.includes('"analytics-hub-module-registry"'), true);
  assert.equal(source.includes('"analytics-hub-module-properties"'), true);
  assert.equal(source.includes('"analytics-hub-module-dashboards"'), true);
  assert.equal(source.includes("Открыть"), true);
  assert.equal(source.includes("Будет позже"), true);
});

test("ProcessAnalyticsHub close button is present", () => {
  assert.equal(source.includes('"analytics-hub-close"'), true);
  assert.equal(source.includes("Вернуться"), true);
});

test("ProcessAnalyticsHub onOpenProductActionsRegistry wiring is present", () => {
  assert.equal(source.includes("onOpenProductActionsRegistry"), true);
  assert.equal(source.includes('"analytics-hub-open-registry"'), true);
  assert.equal(source.includes("Открыть"), true);
});

test("ProcessAnalyticsHub onClose wiring is present", () => {
  assert.equal(source.includes("onClose"), true);
});

test("ProcessAnalyticsHub has no raw numbers as fake data", () => {
  const cleaned = source.replace(/"[^"]*"/g, "");
  const withoutTags = cleaned.replace(/h[1-6]/g, "");
  assert.equal(/\d+/.test(withoutTags), false, "no raw numbers as fake data");
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

test("WorkspaceExplorer does not yet expose analytics hub navigation", () => {
  assert.equal(explorerSource.includes("onOpenAnalyticsHub"), false);
  assert.equal(explorerSource.includes('data-testid="workspace-analytics-hub-nav"'), false);
  assert.equal(explorerSource.includes('data-testid="project-analytics-hub"'), false);
});

test("AppShell does not yet detect analytics surface", () => {
  assert.equal(appShellSource.includes("isAnalyticsSurface"), false);
  assert.equal(appShellSource.includes("analyticsSurfaceActive"), false);
});

test("TopBar does not yet handle analytics surface", () => {
  assert.equal(topBarSource.includes("analyticsSurfaceActive"), false);
  assert.equal(topBarSource.includes('data-testid="topbar-analytics-label"'), false);
});

test("CSS does not yet define analytics hub scoped classes", () => {
  assert.equal(cssSource.includes(".processAnalyticsHubPage"), false);
  assert.equal(cssSource.includes(".processAnalyticsHubHeader"), false);
  assert.equal(cssSource.includes(".processAnalyticsHubSummaryCards"), false);
  assert.equal(cssSource.includes(".processAnalyticsHubModuleCards"), false);
  assert.equal(cssSource.includes(".processAnalyticsHubModuleCard"), false);
});

test("version changelog keeps analytics hub entry and current marker", () => {
  assert.match(versionSource, /currentVersion: "v1\.0\.140"/);
  assert.match(versionSource, /version: "v1\.0\.140"/);
  assert.match(versionSource, /Консолидация дерева: исправлены тесты, подготовлена сборка v1\./);
});
