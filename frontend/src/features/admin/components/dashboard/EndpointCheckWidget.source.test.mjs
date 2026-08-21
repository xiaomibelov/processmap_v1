import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const widgetSource = fs.readFileSync(new URL("./EndpointCheckWidget.jsx", import.meta.url), "utf8");
const pageSource = fs.readFileSync(new URL("../../pages/AdminDashboardPage.jsx", import.meta.url), "utf8");
const adminAppSource = fs.readFileSync(new URL("../../AdminApp.jsx", import.meta.url), "utf8");
const apiSource = fs.readFileSync(new URL("../../../../lib/apiModules/endpointCheckApi.js", import.meta.url), "utf8");

test("EndpointCheckWidget: карточка «Проверка эндпоинтов» с кнопкой «Запустить»", () => {
  assert.match(widgetSource, /Проверка эндпоинтов/);
  assert.match(widgetSource, /Запустить/);
  assert.match(widgetSource, /runCheck/);
  assert.match(widgetSource, /getStatus/);
  assert.match(widgetSource, /getRun/);
});

test("EndpointCheckWidget: поллинг статуса с cleanup", () => {
  assert.match(widgetSource, /ENDPOINT_CHECK_POLL_INTERVAL_MS/);
  assert.match(widgetSource, /window\.setInterval/);
  assert.match(widgetSource, /window\.clearInterval/);
  assert.match(widgetSource, /disabled=\{starting \|\| Boolean\(active\)\}/);
});

test("EndpointCheckWidget: 409 → ненавязчивое notice, без crash", () => {
  assert.match(widgetSource, /Number\(res\?\.status\) === 409/);
  assert.match(widgetSource, /Проверка уже выполняется/);
});

test("EndpointCheckWidget: красный бейдж при new_error > 0 и пустое состояние", () => {
  assert.match(widgetSource, /hasNewErrors/);
  assert.match(widgetSource, /bg-rose-500\/10/);
  assert.match(widgetSource, /Новые ошибки/);
  assert.match(widgetSource, /Прогонов ещё не было/);
});

test("EndpointCheckWidget: сводка последнего прогона", () => {
  assert.match(widgetSource, /новых ошибок/);
  assert.match(widgetSource, /всё ещё падают/);
  assert.match(widgetSource, /починились/);
  assert.match(widgetSource, /triggerLabel/);
  assert.match(widgetSource, /commitShort/);
});

test("EndpointCheckWidget: фильтры и drill-down строки", () => {
  assert.match(widgetSource, /Новые/);
  assert.match(widgetSource, /Падающие/);
  assert.match(widgetSource, /Починившиеся/);
  assert.match(widgetSource, /setExpandedKey/);
  assert.match(widgetSource, /body_excerpt/);
  assert.match(widgetSource, /error_events/);
});

test("AdminDashboardPage: виджет рядом с FeatureFlagsWidget, гейт по праву «API Docs»", () => {
  assert.match(pageSource, /import EndpointCheckWidget/);
  assert.match(pageSource, /canOpenApiDocs = false/);
  assert.match(pageSource, /\{canOpenApiDocs \? <EndpointCheckWidget \/> : null\}/);
  assert.match(pageSource, /<FeatureFlagsWidget \/>/);
});

test("AdminApp: пробрасывает canOpenApiDocs (canOpenOrgSettings) в dashboard", () => {
  assert.match(adminAppSource, /canOpenOrgSettings/);
  assert.match(adminAppSource, /canOpenApiDocs=\{canOpenApiDocs\}/);
});

test("EndpointCheckWidget: блок «Вне сканирования» читает реальный контракт (count + blind_zone)", () => {
  assert.match(widgetSource, /buildNotScannedSummary/);
  assert.match(widgetSource, /mutationsCount/);
  assert.match(widgetSource, /blindZone/);
  assert.match(widgetSource, /слепая зона/);
  assert.doesNotMatch(widgetSource, /notScanned\.mutations|notScanned\.skipped/);
});

test("endpointCheckApi: контракт изолирован в одном api-модуле", () => {
  assert.match(apiSource, /apiRoutes\.admin\.endpointCheckRun\(\)/);
  assert.match(apiSource, /apiRoutes\.admin\.endpointCheckStatus\(\)/);
  assert.match(apiSource, /apiRoutes\.admin\.endpointCheckRuns\(/);
  assert.match(apiSource, /apiRoutes\.admin\.endpointCheckRunDetail\(/);
});
