// Shared source reader for explorer *.source.test.mjs pins.
//
// retarget(s0): WorkspaceExplorer.jsx is being decomposed into many sibling
// files under features/explorer/. The source tests used to read only
// WorkspaceExplorer.jsx and slice it with between(startMarker, endMarker)
// anchored at in-file markers ("function ExplorerPane(", "// ─── Session Row",
// ...). Those markers die during the decomposition, so instead we concatenate
// ALL explorer sources (js/jsx/css, excluding *.test.*) and scope assertions
// either globally over the concatenation or over a window anchored at a stable
// identifier (component name, data-testid, string literal, handler name).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const EXPLORER_DIR = fileURLToPath(new URL("../features/explorer/", import.meta.url));

// retarget(s1): decomposition moves code into subdirectories (components/, hooks/),
// so the listing is recursive. Only path discovery changes — no assertion changes.
function listSourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isDirectory()) return listSourceFiles(path.join(dir, entry.name));
      return path.join(dir, entry.name);
    })
    .filter((file) => /\.(js|jsx|css)$/.test(file) && !/\.test\./.test(file))
    .sort();
}

export function readExplorerSources() {
  const files = listSourceFiles(EXPLORER_DIR).map((file) => path.relative(EXPLORER_DIR, file));
  const parts = files.map((name) => {
    const text = readFileSync(path.join(EXPLORER_DIR, name), "utf8");
    return `/* ─── ${name} ─── */\n${text}`;
  });
  return { files, text: parts.join("\n") };
}

// Window of `length` chars starting at the first occurrence of a stable anchor.
// retarget(s0): replaces between(startMarker, inFileCommentMarker) slices that
// die when WorkspaceExplorer.jsx is split into sibling files.
export function from(source, marker, length = 8000) {
  const index = source.indexOf(marker);
  assert.notEqual(index, -1, `missing anchor: ${marker}`);
  return source.slice(index, index + length);
}

// Window ±radius chars around the first occurrence of a stable anchor.
export function around(source, anchor, radius = 8000) {
  const index = source.indexOf(anchor);
  assert.notEqual(index, -1, `missing anchor: ${anchor}`);
  return source.slice(Math.max(0, index - radius), index + radius);
}

// Slice between two stable anchors (e.g. data-testid of a container and
// data-testid of the next section). Unlike in-file positional markers,
// data-testids survive the decomposition.
export function betweenStable(source, startAnchor, endAnchor) {
  const startIndex = source.indexOf(startAnchor);
  assert.notEqual(startIndex, -1, `missing start anchor: ${startAnchor}`);
  const endIndex = source.indexOf(endAnchor, startIndex + startAnchor.length);
  assert.notEqual(endIndex, -1, `missing end anchor: ${endAnchor}`);
  return source.slice(startIndex, endIndex);
}
