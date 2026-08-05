// LLM1 — source-тест «только по клику»: ни одного фонового/авто-вызова анализа.
// Критерий PLAN.md: grep-проверка + тест.
// Запуск: node --test src/components/process/interview/llmAnalysisBlock.source.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const blockSrc = readFileSync(fileURLToPath(new URL("./LlmAnalysisBlock.jsx", import.meta.url)), "utf8");
const apiSrc = readFileSync(fileURLToPath(new URL("../../../lib/api.js", import.meta.url)), "utf8");

test("LlmAnalysisBlock: нет useEffect — анализ не дергается автоматически", () => {
  assert.ok(!/\buseEffect\b/.test(blockSrc), "useEffect найден — риск авто-вызова");
});

test("LlmAnalysisBlock: apiLlmAnalysis вызывается ровно один раз — в обработчике клика run()", () => {
  const calls = blockSrc.match(/apiLlmAnalysis\(/g) || [];
  assert.equal(calls.length, 1, "apiLlmAnalysis должен вызываться только в run()");
  assert.ok(/onClick=\{\(\) => void run\(false\)\}/.test(blockSrc), "кнопка запуска не найдена");
  assert.ok(/onClick=\{\(\) => void run\(true\)\}/.test(blockSrc), "confirm force-обновления не найден");
});

test("api.js: apiLlmAnalysis не экспортирует side-effect вызовов (только определение)", () => {
  const defs = apiSrc.match(/apiLlmAnalysis\(/g) || [];
  assert.equal(defs.length, 1, "apiLlmAnalysis — только определение функции");
});
