import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./WorkspaceExplorer.jsx", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker ${end}`);
  return source.slice(startIndex, endIndex);
}

test("project rows have explicit project-open affordances in action column", () => {
  const projectRow = between("function ProjectRow(", "function InlineLoadingRow(");
  assert.doesNotMatch(projectRow, /<span>Открыть проект<\/span>/);
  assert.match(projectRow, />\s*Открыть проект\s*<\/AppRouteLink>/);
  assert.match(projectRow, /<EntityTypePill type="project" \/>/);
});

test("session row open CTA lives in dedicated action column", () => {
  const sessionRow = between("function SessionRow(", "// ─── Project Pane");
  // Hint больше не внутри title-ссылки — он в колонке действий w-[88px].
  assert.match(sessionRow, /w-\[88px\][\s\S]*<AppRouteLink[\s\S]*Открыть сессию[\s\S]*<\/AppRouteLink>/);
  assert.match(sessionRow, /Открыть сессию/);
  assert.doesNotMatch(sessionRow, /:\s*\(\s*"Открыть"\s*\)/);
  assert.match(sessionRow, /onClick=\{handleRowOpen\}/);
  assert.match(sessionRow, /if \(isOpening\) return;/);
  assert.match(sessionRow, /source:\s*"workspace_explorer_session_row"/);
  assert.match(sessionRow, /source:\s*"workspace_explorer_session_title"/);
  assert.match(sessionRow, /source:\s*"workspace_explorer_session_cta"/);
  assert.match(sessionRow, /openTab:\s*"diagram"/);
});

test("app version records explorer header and affordance update", () => {
  const versionSource = readFileSync(new URL("../../config/appVersion.js", import.meta.url), "utf8");
  assert.match(versionSource, /version:\s*"v1\.0\.142"/);
  assert.match(versionSource, /"Хедеры Explorer и Project свёрнуты в одну строку с адаптивной раскладкой\./);
});
