// LLM4 — паритет i18n-словарей processman.* (ru ↔ en) и source-проверки кнопки.
// Запуск: node --test src/features/process/processman/processmanI18n.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ru } from "../../../shared/i18n/ru.js";
import { en } from "../../../shared/i18n/en.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "../../../..");

function read(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), "utf8");
}

test("ru.processman и en.processman — полный паритет ключей", () => {
  const ruKeys = Object.keys(ru.processman || {}).sort();
  const enKeys = Object.keys(en.processman || {}).sort();
  assert.deepEqual(enKeys, ruKeys, "ключи en.processman должны совпадать с ru.processman");
  assert.ok(ruKeys.length >= 40, `ожидается полный словарь (получено ${ruKeys.length})`);
  for (const key of ruKeys) {
    assert.ok(String(ru.processman[key] || "").trim().length > 0, `ru.processman.${key} пустой`);
    assert.ok(String(en.processman[key] || "").trim().length > 0, `en.processman.${key} пустой`);
  }
});

test("кнопка PROCESSMAN: «PROCESSMAN» капсом, aria-label и title из i18n (не хардкод)", () => {
  assert.equal(ru.processman.buttonLabel, "PROCESSMAN");
  const controls = read("src/features/process/stage/ui/ProcessStageDiagramControls.jsx");
  assert.ok(controls.includes('data-testid="diagram-action-processman"'), "testid кнопки");
  assert.ok(controls.includes("aria-pressed"), "toggle aria-pressed");
  assert.ok(controls.includes("tProcessman.buttonAriaLabel"), "aria-label из i18n");
  assert.ok(controls.includes("tProcessman.buttonTitle"), "title из i18n");
  assert.ok(!/title="Процесс-менеджер/.test(controls), "title не хардкожен по-русски");
});

test("иконка — файл assets/icons/processman.svg (не эмодзи), currentColor", () => {
  const svgPath = path.join(FRONTEND_ROOT, "src/assets/icons/processman.svg");
  assert.ok(fs.existsSync(svgPath), "файл иконки существует");
  const svg = fs.readFileSync(svgPath, "utf8");
  assert.ok(svg.includes("currentColor"), "currentColor");
  assert.ok(svg.includes('viewBox="0 0 16 16"'), "16px viewBox");
  const controls = read("src/features/process/stage/ui/ProcessStageDiagramControls.jsx");
  assert.ok(controls.includes("assets/icons/processman.svg"), "кнопка использует файл иконки");
});

test("S1: disabled по has_api_key=false — aria-disabled + тултип, доступный с клавиатуры", () => {
  const controls = read("src/features/process/stage/ui/ProcessStageDiagramControls.jsx");
  assert.ok(controls.includes("processmanNoKey"), "признак no-key проброшен");
  assert.ok(controls.includes('"aria-disabled"'), "aria-disabled вместо disabled (фокус доступен)");
  assert.ok(controls.includes("tProcessman.buttonDisabledNoKey"), "тултип про настройку провайдера");
  assert.match(ru.processman.buttonDisabledNoKey, /админ-панели/, "текст тултипа про админ-панель");
});
