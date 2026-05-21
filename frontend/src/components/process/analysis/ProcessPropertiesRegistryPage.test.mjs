import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pageSource = fs.readFileSync(path.join(__dirname, "ProcessPropertiesRegistryPage.jsx"), "utf8");
const routeSource = fs.readFileSync(path.join(__dirname, "../../../app/processMapRouteModel.js"), "utf8");
const versionSource = fs.readFileSync(path.join(__dirname, "../../../config/appVersion.js"), "utf8");

test("properties registry page exposes required foundation structure", () => {
  [
    "Реестр свойств",
    "Сводный список свойств BPMN-элементов и процессных объектов.",
    "Workspace",
    "Проект",
    "Сессия",
    "Источников",
    "Элементов",
    "Свойств",
    "Типов свойств",
    "После фильтров",
    "Объект",
    "Свойство",
    "Значение",
    "Источник / процесс",
    "Тип / группа",
    "Тип свойства",
    "Группа свойства",
    "Процесс / сессия",
    "Статус",
    "Свойства ещё не собраны в реестр. Нужно подключить подтверждённые источники свойств BPMN/оверлеев.",
  ].forEach((label) => assert.equal(pageSource.includes(label), true, `missing label: ${label}`));
});

test("properties registry uses the product actions registry page pattern", () => {
  [
    "productActionsRegistryPage processPropertiesRegistryPage",
    "productActionsRegistryPanel productActionsRegistryPanel--page processPropertiesRegistryPanel--page",
    "productActionsRegistryHeader processPropertiesRegistryHeader",
    "productActionsRegistryScope processPropertiesRegistryScope",
    "productActionsRegistryContainer processPropertiesRegistryContainer",
    "productActionsRegistryMetrics processPropertiesRegistryMetrics",
    "productActionsRegistryFilters processPropertiesRegistryFilters",
    "productActionsRegistryTable processPropertiesRegistryTable",
    "productActionsRegistryRowExpansionGrid processPropertiesRegistryRowExpansionGrid",
    "Сбросить фильтры",
  ].forEach((snippet) => assert.equal(pageSource.includes(snippet), true, `missing product-actions-aligned snippet: ${snippet}`));
  assert.equal(pageSource.includes("processPropertiesRegistrySurface"), false);
});

test("properties registry only reads confirmed session bpmn_meta source", () => {
  assert.match(pageSource, /normalizeCamundaExtensionsMap/);
  assert.match(pageSource, /bpmn_meta\.camunda_extensions_by_element_id/);
  assert.match(pageSource, /hasSessionSource/);
  assert.doesNotMatch(pageSource, /apiPutBpmnXml|apiPatchSession|patchInterviewAnalysis|saveProductActionForStep|apiQueryProductActionRegistry/);
  assert.match(pageSource, /Foundation mode: подтверждённый page-safe источник/);
});

test("route model exposes process properties registry surface", () => {
  assert.match(routeSource, /PROCESS_PROPERTIES_REGISTRY_SURFACE = "process-properties-registry"/);
  assert.match(routeSource, /buildProcessPropertiesRegistryUrl/);
  assert.match(routeSource, /readProcessPropertiesRegistryRoute/);
  assert.match(routeSource, /buildProcessPropertiesRegistryCloseUrl/);
});

test("version changelog records analytics properties registry foundation", () => {
  assert.match(versionSource, /currentVersion: "v1\.0\.138"/);
  assert.match(versionSource, /version: "v1\.0\.138"/);
  assert.match(versionSource, /Реестр свойств добавлен в Аналитику/);
});
