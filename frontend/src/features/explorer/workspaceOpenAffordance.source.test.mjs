import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readExplorerSources, around } from "../../test-utils/explorerSourceText.mjs";

// retarget(s0): WorkspaceExplorer.jsx read moved to the multifile explorer source set;
// row slices are re-anchored at stable identifiers (marquee name cell / kebab-menu title)
// instead of in-file positional markers.
const { text: source } = readExplorerSources();

test("project rows have explicit project-open affordances in action column", () => {
  // retarget(s0): was between("function ProjectRow(", "function InlineLoadingRow(")
  const projectRow = around(source, "<ExplorerMarqueeText text={project.name}", 3500);
  assert.doesNotMatch(projectRow, /<span>Открыть проект<\/span>/);
  assert.match(projectRow, />\s*Открыть →\s*<\/AppRouteLink>/);
  assert.match(projectRow, /<TypeTag type="project" \/>/);
});

test("session row open CTA lives in dedicated action column", () => {
  // retarget(s0): was between("function SessionRow(", "// ─── Project Pane")
  const sessionRow = around(source, 'title="Действия сессии"', 9500);
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
