import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource(name) {
  return fs.readFileSync(path.join(__dirname, name), "utf8");
}

const DIALOGS = readSource("ProcessDialogs.jsx");
const LIST = readSource("BpmnVersionList.jsx");
const PANE = readSource("BpmnVersionComparePane.jsx");
const HEADER = readSource("BpmnVersionCompareHeader.jsx");

test("revision dialogs use RU labels for metadata surface", () => {
  assert.equal(DIALOGS.includes("История версий BPMN"), true);
  assert.equal(DIALOGS.includes("Выберите версию слева"), true);
  assert.equal(DIALOGS.includes("Выберите вторую версию для сравнения (метка B на карточке)"), true);
  assert.equal(DIALOGS.includes("bpmn-versions-modal"), true);
  assert.equal(DIALOGS.includes("bpmn-versions-hint-second"), true);
  assert.equal(DIALOGS.includes("Пользовательские ревизии:"), false);
  assert.equal(DIALOGS.includes("Последние версии:"), false);
  assert.equal(DIALOGS.includes("r{Number("), false);
  assert.equal(DIALOGS.includes(': "черновик"'), false);
  assert.equal(DIALOGS.includes("Сравнить А/В"), false);
  assert.equal(DIALOGS.includes("window.confirm"), false);
});

test("versions modal is assembled from new compare components", () => {
  assert.equal(DIALOGS.includes('from "./BpmnVersionList"'), true);
  assert.equal(DIALOGS.includes('from "./BpmnVersionComparePane"'), true);
  assert.equal(DIALOGS.includes('from "./BpmnVersionCompareHeader"'), true);
  assert.equal(DIALOGS.includes("<BpmnVersionList"), true);
  assert.equal(DIALOGS.includes("<BpmnVersionComparePane"), true);
  assert.equal(DIALOGS.includes("<BpmnVersionCompareHeader"), true);
  assert.equal(DIALOGS.includes("BpmnVersionDiffOverlay"), false);
  assert.equal(DIALOGS.includes("showPreviewXml"), false);
  assert.equal(DIALOGS.includes("bpmn-versions-diff-modal"), false);
  assert.equal(DIALOGS.includes("bpmn-history-diff-modal"), false);
});

test("versions modal separates loading, empty, and error states", () => {
  assert.equal(DIALOGS.includes("resolveRevisionHistoryEmptyState"), true);
  assert.equal(DIALOGS.includes("revisionEmptyState.message"), true);
  assert.equal(DIALOGS.includes('data-testid="bpmn-versions-loading"'), false); // states live in BpmnVersionList
  assert.equal(LIST.includes('data-testid="bpmn-versions-loading"'), true);
  assert.equal(LIST.includes('data-testid="bpmn-versions-empty"'), true);
  assert.equal(LIST.includes('data-testid="bpmn-versions-error"'), true);
});

test("version list cards use RU labels", () => {
  assert.equal(LIST.includes("последняя"), true);
  assert.equal(LIST.includes("техническая"), true);
  assert.equal(LIST.includes("Версия "), true);
  assert.equal(LIST.includes("Без номера версии"), true);
  assert.equal(LIST.includes("Показать технические"), true);
  assert.equal(LIST.includes("Загрузить ещё 10"), true);
  assert.equal(LIST.includes("Загрузка..."), true);
  assert.equal(LIST.includes("Все версии загружены"), true);
  assert.equal(LIST.includes("Обновить список версий"), true);
  assert.equal(LIST.includes("Автор не указан"), true);
  assert.equal(LIST.includes("Скопировано"), true);
  assert.equal(LIST.includes("Скопировать хэш"), true);
});

test("compare pane uses RU labels and inline restore confirmation", () => {
  assert.equal(PANE.includes("Скачать .bpmn"), true);
  assert.equal(PANE.includes("Восстановить"), true);
  assert.equal(PANE.includes("Отмена"), true);
  assert.equal(PANE.includes("Восстановление..."), true);
  assert.equal(PANE.includes("Сравнить с текущей"), true);
  assert.equal(PANE.includes("Это текущая версия"), true);
  assert.equal(PANE.includes("Текущая (черновик)"), false); // title for current draft comes from ProcessStage wiring
  assert.equal(PANE.includes("Повторить"), true);
  assert.equal(PANE.includes("Загрузить XML"), true);
  assert.equal(PANE.includes("Скачать XML для диагностики"), true);
  assert.equal(PANE.includes("Файл большой: показан без построчного сравнения"), true);
  assert.equal(PANE.includes("window.confirm"), false);
  assert.equal(PANE.includes("A · базовая"), false); // role prefix comes from ProcessStage wiring
});

test("compare header legend uses RU labels", () => {
  assert.equal(HEADER.includes("добавлено"), true);
  assert.equal(HEADER.includes("удалено"), true);
  assert.equal(HEADER.includes("изменено"), true);
  assert.equal(HEADER.includes("сдвинут"), true);
  assert.equal(HEADER.includes("изменён размер"), true);
  assert.equal(HEADER.includes("Показывать позиционные изменения"), true);
  assert.equal(HEADER.includes("Диаграмма"), true);
  assert.equal(HEADER.includes("Изменений не найдено"), true);
  assert.equal(HEADER.includes("Вычисляем изменения..."), true);
});
