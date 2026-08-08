// LLM3 — source-тест «только по клику»: ни одного авто-вызова помощника,
// даже при открытии панели (решение владельца на gate).
// Запуск: node --test src/components/process/schemaAssistantBlock.source.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const blockSrc = readFileSync(fileURLToPath(new URL("./SchemaAssistantBlock.jsx", import.meta.url)), "utf8");
const viewSrc = readFileSync(fileURLToPath(new URL("./schemaAssistantView.js", import.meta.url)), "utf8");
const apiSrc = readFileSync(fileURLToPath(new URL("../../lib/api.js", import.meta.url)), "utf8");
const routesSrc = readFileSync(fileURLToPath(new URL("../../lib/apiRoutes.js", import.meta.url)), "utf8");
const panelSrc = readFileSync(fileURLToPath(new URL("../../features/process/processman/ProcessmanPanel.jsx", import.meta.url)), "utf8");
const stageSrc = readFileSync(fileURLToPath(new URL("../ProcessStage.jsx", import.meta.url)), "utf8");

test("SchemaAssistantBlock: нет useEffect — помощник не дергается автоматически (даже при открытии панели)", () => {
  assert.ok(!/\buseEffect\b/.test(blockSrc), "useEffect найден — риск авто-вызова");
  // открытие панели — только setOpen, без LLM-вызовов
  assert.ok(/onClick=\{\(\) => setOpen\(\(v\) => !v\)\}/.test(blockSrc), "toggle панели должен быть чистым");
});

test("три LLM-действия вызываются ровно по одному разу — в обработчиках клика", () => {
  for (const fn of ["apiLlmSuggestNext", "apiLlmExplainStep", "apiLlmStepQa"]) {
    const calls = blockSrc.match(new RegExp(`${fn}\\(`, "g")) || [];
    assert.equal(calls.length, 1, `${fn} — только в обработчике клика`);
    const defs = apiSrc.match(new RegExp(`${fn}\\(`, "g")) || [];
    assert.ok(defs.length >= 1, `${fn} определён в api.js`);
  }
  assert.ok(/data-testid="schema-assistant-suggest"/.test(blockSrc));
  assert.ok(/data-testid="schema-assistant-explain"/.test(blockSrc));
  assert.ok(/data-testid="schema-assistant-ask"/.test(blockSrc));
});

test("explain/qa требуют выделенный шаг (disabled + guard без вызова)", () => {
  assert.ok(/if \(!selectedId\) return;/.test(blockSrc), "explain без шага — no-op");
  assert.ok(/if \(!selectedId \|\| !q\) return;/.test(blockSrc), "qa без шага/вопроса — no-op");
  assert.ok(/disabled=\{!selectedId \|\| explain\.status/.test(blockSrc), "explain disabled без шага");
});

test("роуты LLM3 зарегистрированы в apiRoutes с force-флагом", () => {
  for (const r of ["llmSuggestNext", "llmExplainStep", "llmStepQa"]) {
    assert.ok(routesSrc.includes(`${r}: (sessionId, options = {}) => withQuery(\`/api/sessions/\${encode(sessionId)}/llm/`), `${r} в apiRoutes`);
    assert.ok(routesSrc.includes(`/llm/${r === "llmSuggestNext" ? "suggest-next" : r === "llmExplainStep" ? "explain-step" : "step-qa"}`), "правильный путь эндпоинта");
  }
});

test("маппер статусов покрывает честные статусы (no_provider/rate_limited/no_trace/step_not_found)", () => {
  for (const s of ["no_provider", "rate_limited", "disabled", "no_trace", "step_not_found"]) {
    assert.ok(viewSrc.includes(`"${s}"`), `статус ${s} в маппере`);
    assert.ok(viewSrc.includes(SA_TEXT[s]), `текст для ${s}`);
  }
});

const SA_TEXT = {
  no_provider: "LLM-провайдер не настроен",
  rate_limited: "Превышен дневной лимит",
  disabled: "отключён администратором",
  no_trace: "решения не додумываются",
  step_not_found: "Шаг не найден",
};

test("блок встроен во вкладку «Схема» панели PROCESSMAN (activeTab schema, не то be)", () => {
  assert.ok(/import SchemaAssistantBlock from "\.\.\/\.\.\/\.\.\/components\/process\/SchemaAssistantBlock";/.test(panelSrc), "импорт в ProcessmanPanel");
  assert.ok(
    /<SchemaAssistantBlock sessionId=\{sessionId\} selectedElement=\{selectedBpmnElement\} \/>/.test(panelSrc),
    "рендер с sessionId и выделенным элементом",
  );
  assert.ok(
    /activeTab === "schema" \? \(\s*<div data-testid="processman-schema-pane">/.test(panelSrc),
    "рендер только на вкладке «Схема»",
  );
  assert.ok(/import ProcessmanPanel/.test(stageSrc), "панель подключена в ProcessStage");
  assert.ok(/processmanOpen && tab === "diagram" && !isInterview/.test(stageSrc), "панель только на вкладке «Схема» воркбенча");
});
