// PROCESSMAN-REDESIGN (PR-1) — source-тест «только по клику» для чат-контура
// панели (замена schemaAssistantBlock.source.test.mjs: SchemaAssistantBlock
// удалён из панели и из репозитория, его действия живут в чате ProcessmanTobe).
// Запуск: node --test src/features/process/processman/processmanChatActions.source.test.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tobeSrc = readFileSync(fileURLToPath(new URL("./ProcessmanTobe.jsx", import.meta.url)), "utf8");
const panelSrc = readFileSync(fileURLToPath(new URL("./ProcessmanPanel.jsx", import.meta.url)), "utf8");
const viewSrc = readFileSync(fileURLToPath(new URL("../../../components/process/schemaAssistantView.js", import.meta.url)), "utf8");
const apiSrc = readFileSync(fileURLToPath(new URL("../../../lib/api.js", import.meta.url)), "utf8");
const routesSrc = readFileSync(fileURLToPath(new URL("../../../lib/apiRoutes.js", import.meta.url)), "utf8");
const stageSrc = readFileSync(fileURLToPath(new URL("../../../components/ProcessStage.jsx", import.meta.url)), "utf8");

const blockPath = fileURLToPath(new URL("../../../components/process/SchemaAssistantBlock.jsx", import.meta.url));

test("SchemaAssistantBlock удалён: файла нет, панель его не импортирует и не рендерит", () => {
  assert.equal(existsSync(blockPath), false, "SchemaAssistantBlock.jsx удалён из репозитория");
  assert.ok(!/SchemaAssistantBlock/.test(panelSrc), "ProcessmanPanel без SchemaAssistantBlock");
  assert.ok(!/processman-schema-pane/.test(panelSrc), "schema-pane удалён из панели");
  const stageWithoutPanel = stageSrc.replace(/<ProcessmanPanel[\s\S]*?\/>/g, "");
  assert.ok(!/<SchemaAssistantBlock/.test(stageWithoutPanel), "в ProcessStage вне панели блока нет");
});

test("три LLM-действия вызываются ровно по одному разу — в ACTION_RUNNERS (клик), не в useEffect", () => {
  assert.ok(/const ACTION_RUNNERS = \{/.test(tobeSrc), "ACTION_RUNNERS — единая точка вызовов");
  for (const fn of ["apiLlmSuggestNext", "apiLlmExplainStep", "apiLlmStepQa"]) {
    const calls = tobeSrc.match(new RegExp(`${fn}\\(`, "g")) || [];
    assert.equal(calls.length, 1, `${fn} — только в ACTION_RUNNERS`);
    const defs = apiSrc.match(new RegExp(`${fn}\\(`, "g")) || [];
    assert.ok(defs.length >= 1, `${fn} определён в api.js`);
  }
  const effects = tobeSrc.match(/useEffect\(\(\)\s*=>[\s\S]*?\}, \[[^\]]*\]\)/g) || [];
  for (const effect of effects) {
    assert.ok(!/apiLlm|fetch\(/.test(effect), "useEffect без LLM-вызовов");
  }
});

test("guard'ы: qa без вопроса — no-op; без выбранного шага — честный локальный ответ (0 LLM)", () => {
  assert.ok(/if \(action === "qa" && !q\) return;/.test(tobeSrc), "qa без вопроса — no-op");
  assert.ok(/noStepReplyTitle/.test(tobeSrc), "qa/suggest без шага → честная локальная заметка, не выдуманный ответ");
  assert.ok(/actionsDisabled/.test(tobeSrc), "quick actions disabled без шага/ключа/квоты");
});

test("роуты LLM3 зарегистрированы в apiRoutes с force-флагом (API не менялся)", () => {
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

test("панель подключена в ProcessStage и получает focus/clear-selection колбэки (PR-1: существующий focusNode)", () => {
  assert.ok(/import ProcessmanPanel/.test(stageSrc), "панель подключена в ProcessStage");
  assert.ok(
    /\(processmanOpen \|\| processmanClosing\)/.test(stageSrc),
    "панель рендерится по open/closing (не закрывается при переключении вкладок воркбенча)",
  );
  assert.ok(/onFocusElement=\{/.test(stageSrc), "проброс фокуса узла (чипы 📍, чип контекста)");
  assert.ok(/onClearSelection=\{/.test(stageSrc), "проброс сброса выделения");
});

// HOTFIX 2026-08-09 — stage-инцидент: потерянный импорт processman.css при
// редизайне уронил layout всей рабочей области (стили pm-processman-layout/__canvas
// живут в том же файле). Регрессионные гарантии:
test("HOTFIX: ProcessmanPanel импортирует processman.css (иначе layout канваса рассыпается)", () => {
  assert.ok(
    /import "\.\/processman\.css";/.test(panelSrc),
    "import \"./processman.css\" обязателен: там стили layout-обёртки канваса",
  );
});

test("HOTFIX: панель обёрнута в Error Boundary (сбой панели не роняет канвас)", () => {
  assert.ok(
    /import ProcessmanErrorBoundary from "\.\.\/features\/process\/processman\/ProcessmanErrorBoundary";/.test(stageSrc),
    "импорт ProcessmanErrorBoundary в ProcessStage",
  );
  assert.ok(
    /<ProcessmanErrorBoundary>\s*<ProcessmanPanel/.test(stageSrc),
    "ProcessmanPanel обёрнута в ProcessmanErrorBoundary",
  );
  const boundarySrc = readFileSync(fileURLToPath(new URL("./ProcessmanErrorBoundary.jsx", import.meta.url)), "utf8");
  assert.ok(/getDerivedStateFromError/.test(boundarySrc), "boundary ловит ошибки рендера");
  assert.ok(/if \(this\.state\.hasError\) return null;/.test(boundarySrc), "при ошибке — null, канвас жив");
});

// agent-ui-completion-v1 (G3) — мёртвый legacy-код AgentButton/AgentModal удалён:
// ни одного runtime-импорта по всему frontend/src (тест-файлы не считаются).
test("G3: 0 runtime-импортов AgentButton/AgentModal по всему frontend/src", () => {
  const srcRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(full);
      } else if (/\.(jsx?|tsx?|mjs)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
        const text = readFileSync(full, "utf8");
        if (/\b(AgentButton|AgentModal)\b/.test(text)) offenders.push(path.relative(srcRoot, full));
      }
    }
  };
  walk(srcRoot);
  assert.deepEqual(offenders, [], `runtime-упоминания AgentButton/AgentModal найдены: ${offenders.join(", ")}`);
  assert.equal(existsSync(path.join(srcRoot, "components/agent/AgentButton.tsx")), false, "AgentButton.tsx удалён");
  assert.equal(existsSync(path.join(srcRoot, "components/agent/AgentModal.tsx")), false, "AgentModal.tsx удалён");
});
