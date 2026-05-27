import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function read(name) {
  return fs.readFileSync(path.join(__dirname, name), "utf8");
}

const layout = read("RegistryLayout.jsx");
const header = read("RegistryHeader.jsx");
const tabs = read("ScopeTabs.jsx");
const metrics = read("MetricsRow.jsx");
const filters = read("FiltersRow.jsx");
const warnings = read("WarningRow.jsx");
const ai = read("AIControlsRow.jsx");
const table = read("DataTable.jsx");
const source = read("SourceSection.jsx");
const empty = read("EmptyState.jsx");
const skeleton = read("LoadingSkeleton.jsx");
const panel = read("../ProductActionsRegistryPanel.jsx");
const cssPath = path.join(__dirname, "../../../styles/tailwind.css");
const css = fs.readFileSync(cssPath, "utf8");

test("RegistryLayout renders single white container with correct class", () => {
  assert.match(layout, /registryLayout/);
  assert.match(layout, /data-testid="registry-layout"/);
});

test("RegistryHeader renders title and export dropdown", () => {
  assert.match(header, /Реестр действий/);
  assert.match(header, /registryExportBtn/);
  assert.match(header, /data-testid="registry-export-toggle"/);
  assert.match(header, /exportOptions/);
  assert.match(header, /registryHelpTooltip/);
});

test("ScopeTabs renders tabs from view_model and marks active tab", () => {
  assert.match(tabs, /tabs/);
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /aria-selected/);
  assert.match(tabs, /isActive/);
  assert.match(tabs, /data-testid="registry-scope-tabs"/);
});

test("MetricsRow renders metrics and colors fill rate correctly", () => {
  assert.match(metrics, /registryMetricValue/);
  assert.match(metrics, /registryMetricLabel/);
  assert.match(metrics, /заполненность/);
  assert.match(metrics, /registry-green-complete/);
  assert.match(metrics, /registry-orange-partial/);
  assert.match(metrics, /—/);
});

test("FiltersRow renders backend-driven filters and reset button", () => {
  assert.match(filters, /registryFilterSelect/);
  assert.match(filters, /registryFilterReset/);
  assert.match(filters, /Сбросить фильтры/);
  assert.match(filters, /data-testid="registry-filters-row"/);
  assert.equal(filters.includes("product_group"), false);
  assert.equal(filters.includes("hardcode"), false);
});

test("WarningRow hidden when warnings empty; renders when present", () => {
  assert.match(warnings, /registryWarningRow/);
  assert.match(warnings, /registryWarningIcon/);
  assert.equal(warnings.includes("return null"), true);
});

test("AIControlsRow hidden when count is 0", () => {
  assert.match(ai, /count === 0/);
  assert.match(ai, /return null/);
  assert.match(ai, /data-testid="registry-ai-controls-row"/);
});

test("DataTable renders correct columns and status badges use dots not backgrounds", () => {
  assert.match(table, /Действие/);
  assert.match(table, /Продукт/);
  assert.match(table, /Сессия/);
  assert.match(table, /Источник/);
  assert.match(table, /Статус/);
  assert.match(table, /Дата/);
  assert.match(table, /registryStatusDot/);
  assert.match(table, /registryStatusBadge/);
  assert.equal(table.includes("backgroundColor"), false);
});

test("EmptyState renders centered content without fake rows", () => {
  assert.match(empty, /registryEmptyState/);
  assert.match(empty, /data-testid="registry-empty-state"/);
  assert.equal(empty.includes("fake"), false);
  assert.equal(empty.includes("skeleton"), false);
});

test("LoadingSkeleton renders skeleton bars not spinners", () => {
  assert.match(skeleton, /registrySkeleton/);
  assert.match(skeleton, /registrySkeletonBar/);
  assert.equal(skeleton.includes("spinner"), false);
  assert.equal(skeleton.includes("Spinner"), false);
});

test("ProductActionsRegistryPanel calls new API endpoint and passes view_model to children", () => {
  assert.match(panel, /apiQueryProductActionRegistry/);
  assert.match(panel, /sessionViewModel/);
  assert.match(panel, /ProductActionsRegistryContent/);
});

test("CSS contains registry design tokens scoped under .registryLayout", () => {
  assert.match(css, /--registry-bg-canvas:/);
  assert.match(css, /--registry-bg-surface:/);
  assert.match(css, /--registry-text-primary:/);
  assert.match(css, /--registry-purple-primary:/);
  assert.match(css, /--registry-green-complete:/);
  assert.match(css, /--registry-orange-partial:/);
  assert.match(css, /\.registryLayout\s*\{/);
});

test("CSS does not contain forbidden patterns in registry scope", () => {
  const registryBlock = css.split(".registryLayout {")[1]?.split("@media")[0] || "";
  assert.equal(registryBlock.includes("gradient"), false);
  assert.equal(registryBlock.includes("dotted"), false);
  assert.equal(registryBlock.includes("box-shadow: inset"), false);
});
