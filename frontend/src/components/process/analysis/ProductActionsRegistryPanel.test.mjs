import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "ProductActionsRegistryPanel.jsx"), "utf8");
const pageSource = fs.readFileSync(path.join(__dirname, "ProductActionsRegistryPage.jsx"), "utf8");
const productPanelSource = fs.readFileSync(path.join(__dirname, "../interview/ProductActionsPanel.jsx"), "utf8");

test("ProductActionsRegistryPanel exposes preview registry UI without export wording", () => {
  [
    "Реестр действий с продуктом",
    "Read-only preview",
    "Workspace",
    "Проект",
    "Сессия",
    "Загрузить выбранные",
    "Фильтры применяются к загруженным строкам.",
    "CSV — позже",
    "XLSX — позже",
    "В выбранных процессах пока нет действий с продуктом.",
  ].forEach((label) => assert.equal(source.includes(label), true, `missing label: ${label}`));
});

test("ProductActionsRegistryPanel uses summary first and loads only selected full sessions", () => {
  assert.match(source, /apiListProjectSessions\(projectId,\s*""\,\s*\{ view: "summary" \}\)/);
  assert.match(source, /apiGetSession\(sid\)/);
  assert.equal(source.includes("Загрузить выбранные"), true);
  assert.equal(source.includes("Full session loads are intentionally explicit and capped."), true);
  assert.equal(source.includes("PRODUCT_ACTIONS_REGISTRY_SESSION_CAP"), true);
  assert.doesNotMatch(source, /apiGetBpmnXml|apiPutBpmnXml|apiPatchSession|patchInterviewAnalysis|saveProductActionForStep/);
});

test("ProductActionsRegistryPanel provides filters, completeness and disabled export placeholders", () => {
  assert.equal(source.includes("filterProductActionRegistryRows"), true);
  assert.equal(source.includes("summarizeProductActionRegistryRows"), true);
  assert.equal(source.includes("uniqueProductActionRegistryFilterOptions"), true);
  assert.equal(source.includes("productActionsRegistryCompleteness"), true);
  assert.match(source, /disabled>\s*CSV — позже\s*<\/button>/);
  assert.match(source, /disabled>\s*XLSX — позже\s*<\/button>/);
});

test("ProductActionsRegistryPage renders content as page shell without dialog contract", () => {
  assert.equal(pageSource.includes("productActionsRegistryPage"), true);
  assert.equal(pageSource.includes("showWorkspaceScope"), true);
  assert.equal(pageSource.includes("ProductActionsRegistryContent"), true);
  assert.doesNotMatch(pageSource, /role="dialog"|aria-modal|productActionsRegistryOverlay/);
});

test("ProductActionsPanel navigates to registry surface without changing persistence", () => {
  assert.equal(productPanelSource.includes("onOpenProductActionsRegistry"), true);
  assert.equal(productPanelSource.includes("Реестр действий"), true);
  assert.equal(productPanelSource.includes('data-testid="product-actions-open-registry"'), true);
  assert.equal(productPanelSource.includes('scope: "session"'), true);
  assert.equal(productPanelSource.includes("saveProductActionForStep"), true);
  assert.equal(productPanelSource.includes("deleteProductActionForStep"), true);
  assert.equal(productPanelSource.includes("ProductActionsRegistryPanel"), false);
});
