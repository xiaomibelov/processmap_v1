import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const explorerSource = readFileSync(new URL("./WorkspaceExplorer.jsx", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = explorerSource.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = explorerSource.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return explorerSource.slice(startIndex, endIndex);
}

test("P4 [А]: adaptive uses container ResizeObserver + pure layout function (no viewport media)", () => {
  const paneSource = between("function ExplorerPane(", "// ─── Session Row");
  assert.match(paneSource, /new ResizeObserver/);
  assert.match(paneSource, /getExplorerColumnLayout\(explorerTableWidth/);
  assert.match(paneSource, /explorerVisibleColumnCount\(explorerColumnLayout/);
  // временная мера P0 (minWidth 1044/1116 + h-scroll) убрана
  assert.doesNotMatch(explorerSource, /minWidth:\s*(treeColumnProfile|1044|1116)/);
});

test("P4 [А]: header hidden in compact; columns hidden by priority flags", () => {
  const paneSource = between("function ExplorerPane(", "// ─── Session Row");
  assert.match(paneSource, /explorerColumnLayout\.compact \? null : \(\s*<thead>/);
  assert.match(paneSource, /explorerColumnLayout\.showUpdated \? \(/);
  assert.match(paneSource, /explorerColumnLayout\.showAssignee \? \(/);
  assert.match(paneSource, /explorerColumnLayout\.showComposition \? \(/);
  // «Название» и «Статус» не скрываются никогда — нет условного рендера
  assert.doesNotMatch(paneSource, /showName|showStatus\s*\?/);
});

test("P4 [А]: marquee applied to name cells of all tree row types", () => {
  const folderRow = between("function FolderRow(", "// ─── Project Row");
  const projectRow = between("function ProjectRow(", "// ─── P2 [Б]");
  const sessionRow = between("function SessionTreeRow(", "// Строки сессий раскрытого проекта");
  for (const [name, src] of [["folder", folderRow], ["project", projectRow], ["session", sessionRow]]) {
    assert.match(src, /<ExplorerMarqueeText /, name);
    assert.match(src, /layout\.compact/, name);
  }
  // Контейнерные строки имеют meta-строку; листовые (сессии) — нет.
  assert.match(folderRow, /explorer-row-meta/);
  assert.match(folderRow, /buildExplorerRowMeta/);
  assert.match(projectRow, /explorer-row-meta/);
  assert.match(projectRow, /buildExplorerRowMeta/);
  // marquee-контракт: прокрутка только при реальном обрезании
  const marquee = between("function ExplorerMarqueeText(", "function StatusDotBadge(");
  assert.match(marquee, /isExplorerTextTruncated\(inner\.scrollWidth, outer\.clientWidth\)/);
  assert.match(marquee, /explorerMarqueeMotion/);
});

test("P4 [А]: marquee CSS has fade mask + reduced-motion guard", () => {
  const css = readFileSync(new URL("./explorerAdaptive.css", import.meta.url), "utf8");
  assert.match(css, /mask-image: linear-gradient/);
  assert.match(css, /@keyframes explorer-marquee-scroll/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /text-overflow: ellipsis/);
});
