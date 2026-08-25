// Source-тест ProductActionSuggestionsPanel: HITL-флоу не дергает генерацию/apply автоматически.
// Запуск: node --test src/features/process/analysis/productActionSuggestionsPanel.source.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const panelSrc = readFileSync(fileURLToPath(new URL("./ProductActionSuggestionsPanel.jsx", import.meta.url)), "utf8");
const apiSrc = readFileSync(fileURLToPath(new URL("../../../lib/api.js", import.meta.url)), "utf8");

test("ProductActionSuggestionsPanel: генерация вызывается только по кнопке", () => {
  const calls = panelSrc.match(/apiSuggestProductActions\(/g) || [];
  assert.equal(calls.length, 1, "apiSuggestProductActions должен вызываться только в обработчике генерации");
  assert.ok(/onClick=\{handleGenerate\}/.test(panelSrc), "кнопка генерации не найдена");
});

test("ProductActionSuggestionsPanel: apply вызывается только по кнопке", () => {
  const calls = panelSrc.match(/apiApplyProductActionSuggestions\(/g) || [];
  assert.equal(calls.length, 1, "apiApplyProductActionSuggestions должен вызываться только в обработчике apply");
  assert.ok(/onClick=\{handleApply\}/.test(panelSrc), "кнопка apply не найдена");
});

test("ProductActionSuggestionsPanel: RAG-переход вызывается только по кнопке", () => {
  const calls = panelSrc.match(/apiTransitionRagReadiness\(/g) || [];
  assert.equal(calls.length, 1, "apiTransitionRagReadiness должен вызываться только в обработчике отправки на RAG");
  assert.ok(/onClick=\{handleSendToRag\}/.test(panelSrc), "кнопка отправки на RAG не найдена");
});

test("ProductActionSuggestionsPanel: useEffect только для загрузки существующих suggestions", () => {
  const effects = panelSrc.match(/useEffect\(\(/g) || [];
  assert.equal(effects.length, 1, "должен быть ровно один useEffect для загрузки suggestions/readiness");
});

test("ProductActionSuggestionsPanel: data-testid покрывает ключевые элементы", () => {
  assert.ok(/data-testid="product-action-suggestions-panel"/.test(panelSrc), "нет testid панели");
  assert.ok(/data-testid="product-actions-generate"/.test(panelSrc), "нет testid кнопки генерации");
  assert.ok(/data-testid="product-actions-apply"/.test(panelSrc), "нет testid кнопки apply");
  assert.ok(/data-testid="product-actions-send-rag"/.test(panelSrc), "нет testid кнопки отправки на RAG");
  assert.ok(/data-testid="product-actions-stats"/.test(panelSrc), "нет testid статистики");
  assert.ok(/data-testid="product-actions-list"/.test(panelSrc), "нет testid списка");
});

test("api.js: product-action suggestion helpers экспортируются", () => {
  assert.ok(/export async function apiListProductActionSuggestions\(/.test(apiSrc), "нет экспорта apiListProductActionSuggestions");
  assert.ok(/export async function apiUpdateProductActionSuggestion\(/.test(apiSrc), "нет экспорта apiUpdateProductActionSuggestion");
  assert.ok(/export async function apiApplyProductActionSuggestions\(/.test(apiSrc), "нет экспорта apiApplyProductActionSuggestions");
  assert.ok(/export async function apiGetRagReadiness\(/.test(apiSrc), "нет экспорта apiGetRagReadiness");
  assert.ok(/export async function apiTransitionRagReadiness\(/.test(apiSrc), "нет экспорта apiTransitionRagReadiness");
});
