import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readExplorerSources, around } from "../../test-utils/explorerSourceText.mjs";

// retarget(s0): pins are scoped to the whole explorer source set — WorkspaceExplorer.jsx
// is decomposed into sibling files; in-file between() slices anchored at markers like
// "function ExplorerPane(" are removed.
const { text: explorerSource } = readExplorerSources();

test("P4 [А]: adaptive uses container ResizeObserver + pure layout function (no viewport media)", () => {
  assert.match(explorerSource, /new ResizeObserver/);
  assert.match(explorerSource, /getExplorerColumnLayout\(explorerTableWidth/);
  assert.match(explorerSource, /explorerVisibleColumnCount\(explorerColumnLayout/);
  // временная мера P0 (minWidth 1044/1116 + h-scroll) убрана
  assert.doesNotMatch(explorerSource, /minWidth:\s*(treeColumnProfile|1044|1116)/);
});

test("P4 [А]: header hidden in compact; columns hidden by priority flags", () => {
  assert.match(explorerSource, /explorerColumnLayout\.compact \? null : \(\s*<thead>/);
  assert.match(explorerSource, /explorerColumnLayout\.showUpdated \? \(/);
  assert.match(explorerSource, /explorerColumnLayout\.showAssignee \? \(/);
  assert.match(explorerSource, /explorerColumnLayout\.showComposition \? \(/);
  // «Название» и «Статус» не скрываются никогда — нет условного рендера
  assert.doesNotMatch(explorerSource, /showName|showStatus\s*\?/);
});

test("P4 [А]: marquee applied to name cells of all tree row types", () => {
  // retarget(s0): was sliced via between("function FolderRow(", ...), between("function ProjectRow(", ...)
  // and between("function SessionTreeRow(", ...); each row type is now located by a stable anchor
  // (data-testid / string literal unique to the row markup).
  const rowAnchors = [
    ["folder", 'data-testid={`folder-navigate-', 3000],
    ["project", "<ExplorerMarqueeText text={project.name}", 3500],
    ["session", "title={session.name || session.title}", 3000],
  ];
  for (const [name, anchor, radius] of rowAnchors) {
    const rowSource = around(explorerSource, anchor, radius);
    assert.match(rowSource, /<ExplorerMarqueeText /, name);
    assert.match(rowSource, /layout\.compact/, name);
  }
  // Контейнерные строки имеют meta-строку; листовые (сессии) — нет.
  const folderRowSource = around(explorerSource, 'data-testid={`folder-navigate-', 3000);
  const projectRowSource = around(explorerSource, "<ExplorerMarqueeText text={project.name}", 3500);
  assert.match(folderRowSource, /explorer-row-meta/);
  assert.match(folderRowSource, /buildExplorerRowMeta/);
  assert.match(projectRowSource, /explorer-row-meta/);
  assert.match(projectRowSource, /buildExplorerRowMeta/);
  // marquee-контракт: прокрутка только при реальном обрезании
  assert.match(explorerSource, /isExplorerTextTruncated\(inner\.scrollWidth, outer\.clientWidth\)/);
  assert.match(explorerSource, /explorerMarqueeMotion/);
});

test("P4 [А]: marquee CSS has fade mask + reduced-motion guard", () => {
  const css = readFileSync(new URL("./explorerAdaptive.css", import.meta.url), "utf8");
  assert.match(css, /mask-image: linear-gradient/);
  assert.match(css, /@keyframes explorer-marquee-scroll/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /text-overflow: ellipsis/);
});
