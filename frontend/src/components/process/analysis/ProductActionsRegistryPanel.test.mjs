import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "ProductActionsRegistryPanel.jsx"), "utf8");
const pageSource = fs.readFileSync(path.join(__dirname, "ProductActionsRegistryPage.jsx"), "utf8");
const productPanelSource = fs.readFileSync(path.join(__dirname, "../interview/ProductActionsPanel.jsx"), "utf8");

test("ProductActionsRegistryPanel exposes preview registry UI with export actions", () => {
  [
    "Реестр действий с продуктом",
    "read-only",
    "Workspace",
    "Проект",
    "Сессия",
    "Загрузить выбранные",
    "Сессии workspace",
    "Все сессии в выбранном scope, включая сессии без действий с продуктом.",
    "Открыть проект",
    "Открыть сессию",
    "AI: предложить действия",
    "AI-предложения по выбранным сессиям",
    "Принять выбранные",
    "Найдены действия, но не получен список сессий. Требуется обновить агрегацию.",
    "CSV",
    "XLSX",
    "Экспорт:",
    "Нет строк под выбранные фильтры.",
    "В выбранных процессах пока нет действий с продуктом.",
  ].forEach((label) => assert.equal(source.includes(label), true, `missing label: ${label}`));
});

test("ProductActionsRegistryPanel uses summary first and loads only selected full sessions", () => {
  assert.match(source, /apiQueryProductActionRegistry/);
  assert.match(source, /normalizeBackendSessions/);
  assert.match(source, /summarizeRowsAsSessions/);
  assert.match(source, /result\.sessions/);
  assert.match(source, /backendSessionSummary/);
  assert.match(source, /apiListProjectSessions\(projectId,\s*""\,\s*\{ view: "summary" \}\)/);
  assert.match(source, /apiGetSession\(sid\)/);
  assert.equal(source.includes("Сводка строится без загрузки полных данных всех сессий на frontend."), true);
  assert.equal(source.includes("Workspace-реестр использует backend-агрегацию"), false);
  assert.equal(source.includes("Загрузить выбранные"), true);
  assert.equal(source.includes("Full session loads are intentionally explicit and capped."), true);
  assert.equal(source.includes("PRODUCT_ACTIONS_REGISTRY_SESSION_CAP"), true);
  assert.doesNotMatch(source, /apiGetBpmnXml|apiPutBpmnXml|apiPatchSession|patchInterviewAnalysis|saveProductActionForStep/);
});

test("ProductActionsRegistryPanel exposes workspace session drilldown without workspace full-session scan", () => {
  assert.equal(source.includes('data-testid="product-actions-registry-sessions"'), true);
  assert.equal(source.includes("actions_total"), true);
  assert.equal(source.includes("sessions_without_actions"), true);
  assert.equal(source.includes("missingSessionSummary"), true);
  assert.equal(source.includes("showSessionSummaryEmpty"), true);
  assert.equal(source.includes("openProjectFromSummary"), true);
  assert.equal(source.includes("openSessionFromSummary"), true);
  assert.equal(source.includes('openTab: "diagram"'), true);
  assert.equal(source.includes('source: "product_actions_registry"'), true);
  assert.match(source, /className="productActionsRegistrySessionSummaryRow"[\s\S]*onClick=\{\(\) => openSessionFromSummary\(item\)\}/);
  assert.match(source, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.equal(source.includes('source: "product_actions_registry"'), true);
  assert.doesNotMatch(source, /scope === "workspace"[\s\S]{0,1200}apiGetSession\(sid\)/);
});

test("ProductActionsRegistryPanel exposes capped bulk AI review and safe accept path", () => {
  assert.equal(source.includes("apiBulkSuggestProductActions"), true);
  assert.equal(source.includes("PRODUCT_ACTIONS_BULK_AI_SESSION_CAP = 10"), true);
  assert.equal(source.includes('data-testid="product-actions-registry-bulk-ai-controls"'), true);
  assert.equal(source.includes('data-testid="product-actions-registry-bulk-ai-review"'), true);
  assert.equal(source.includes("selectedVisibleSessionIds"), true);
  assert.equal(source.includes("acceptSelectedBulkAiRows"), true);
  assert.equal(source.includes("acceptAiProductActions({"), true);
  assert.equal(source.includes("currentAnalysis: fullSession?.interview?.analysis"), true);
  assert.equal(source.includes("Выберите предложения для принятия."), true);
  assert.equal(source.includes("AI_RESPONSE_PARSE_ERROR"), true);
  assert.equal(source.includes("AI вернул ответ в некорректном формате"), true);
  assert.equal(source.includes("apiExportProductActionRegistryCsv"), true);
  assert.equal(source.includes("apiExportProductActionRegistryXlsx"), true);
  assert.doesNotMatch(source, /apiPutBpmnXml|apiPatchSession|saveProductActionForStep/);
});

test("ProductActionsRegistryPanel provides filters, completeness and backend export controls", () => {
  assert.equal(source.includes("filterProductActionRegistryRows"), true);
  assert.equal(source.includes("summarizeProductActionRegistryRows"), true);
  assert.equal(source.includes("uniqueProductActionRegistryFilterOptions"), true);
  assert.equal(source.includes("productActionsRegistryCompleteness"), true);
  assert.match(source, /data-testid="product-actions-registry-export-csv"/);
  assert.match(source, /data-testid="product-actions-registry-export-xlsx"/);
  assert.match(source, /buildExportPayload/);
  assert.match(source, /selectedVisibleSessionIds/);
  assert.match(source, /product_groups: toText\(filters\.product_group\)/);
  assert.match(source, /downloadExportBlob/);
  assert.equal(source.includes("Нет строк для выгрузки."), true);
  assert.equal(source.includes("CSV — позже"), false);
  assert.equal(source.includes("XLSX — позже"), false);
});

test("ProductActionsRegistryPanel session scope calls apiGetSessionAnalysisViewModel and uses backend fields", () => {
  assert.match(source, /apiGetSessionAnalysisViewModel/);
  assert.match(source, /sessionViewModel/);
  assert.match(source, /normalizedScope === "session"/);
  assert.match(source, /vmResult\?\.analysis\?\.product_actions\?\.rows/);
  assert.match(source, /vmFilterOptions/);
  assert.match(source, /vmSummary/);
  assert.match(source, /vmMetrics/);
});

test("ProductActionsRegistryPanel preserves fallback when backend fields are absent", () => {
  assert.match(source, /Array\.isArray\(viewModelRows\) \? normalizeBackendRows\(viewModelRows\) : currentRows/);
  assert.match(source, /uniqueProductActionRegistryFilterOptions\(rows\)/);
  assert.match(source, /summarizeProductActionRegistryRows\(rows\)/);
});

test("ProductActionsRegistryPage renders content as page shell without dialog contract", () => {
  assert.equal(pageSource.includes("productActionsRegistryPage"), true);
  assert.equal(pageSource.includes("showWorkspaceScope"), true);
  assert.equal(pageSource.includes("ProductActionsRegistryContent"), true);
  assert.doesNotMatch(pageSource, /role="dialog"|aria-modal|productActionsRegistryOverlay/);
});

test("ProductActionsPanel navigates to registry surface without changing persistence", () => {
  assert.equal(productPanelSource.includes("onOpenProductActionsRegistry"), true);
  assert.equal(productPanelSource.includes("Реестр"), true);
  assert.equal(productPanelSource.includes('data-testid="product-actions-open-registry"'), true);
  assert.equal(productPanelSource.includes('scope: "session"'), true);
  assert.equal(productPanelSource.includes("saveProductActionForStep"), true);
  assert.equal(productPanelSource.includes("deleteProductActionForStep"), true);
  assert.equal(productPanelSource.includes("ProductActionsRegistryPanel"), false);
});
