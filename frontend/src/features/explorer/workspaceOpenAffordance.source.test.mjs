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

test("project rows have explicit project-open affordances", () => {
  const projectRow = between("function ProjectRow(", "function InlineLoadingRow(");
  assert.match(projectRow, /<span>Открыть проект<\/span>/);
  assert.match(projectRow, />\s*Открыть проект\s*<\/AppRouteLink>/);
  assert.match(projectRow, /<EntityTypePill type="project" \/>/);
});

test("session row open hint is part of the session link", () => {
  const sessionRow = between("function SessionRow(", "// ─── Project Pane");
  assert.match(sessionRow, /<AppRouteLink[\s\S]*href=\{sessionHref\}[\s\S]*Открыть сессию[\s\S]*<\/AppRouteLink>/);
  assert.match(sessionRow, /onClick=\{handleRowOpen\}/);
  assert.match(sessionRow, /if \(isOpening\) return;/);
});

test("app version records explorer open affordance update", () => {
  const versionSource = readFileSync(new URL("../../config/appVersion.js", import.meta.url), "utf8");
  assert.match(versionSource, /currentVersion:\s*"v1\.0\.105"/);
  assert.match(versionSource, /"В Explorer различены проекты и сессии при открытии\."/);
});
