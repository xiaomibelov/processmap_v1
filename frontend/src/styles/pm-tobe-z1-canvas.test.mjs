// Z1 TOBE-UX: канвас-guard — max-height убран, zoom/pan/minimap/i18n-палитра на месте.
// Запуск: node --test src/styles/pm-tobe-z1-canvas.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const css = read("../features/technologist/graph/GraphCanvas.css");
const wsCss = read("../features/technologist/workspace/Workspace.css");
const overlay = read("../features/technologist/graph/OverlayGraphCanvas.jsx");
const hook = read("../features/technologist/graph/useViewBoxZoom.js");
const zoomMath = read("../features/technologist/graph/viewBoxZoom.js");
const controls = read("../features/technologist/graph/GraphZoomControls.jsx");
const minimap = read("../features/technologist/graph/GraphMinimap.jsx");
const ws = read("../features/technologist/workspace/Workspace.jsx");
const ctor = read("../features/technologist/constructor/Constructor.jsx");
const blocks = read("../features/technologist/constructor/structuralBlocks.js");
const ru = read("../features/technologist/i18n/ru.js");
const en = read("../features/technologist/i18n/en.js");

test("Z1-1: max-height:620px убран; канвас на всю высоту зоны через viewport-обёртку", () => {
  assert.doesNotMatch(css, /max-height:\s*620px/, "max-height:620px не должен остаться");
  assert.match(css, /\.graph-canvas-viewport \{[\s\S]*?height: 100%;/);
  assert.match(css, /\.graph-canvas-viewport \.graph-canvas \{[\s\S]*?height: 100%;/);
  assert.match(wsCss, /\.ws__canvas \{[^}]*overflow: hidden;/, "pan не конфликтует со скроллом зоны");
  assert.match(wsCss, /\.ws__canvas \.graph-canvas-viewport \{[^}]*flex: 1 1 auto;/);
});

test("Z1-2: zoom-контролы ±/fit/1:1 с процентом, i18n-подписями и SVG-иконками (не эмодзи)", () => {
  for (const id of ["graph-zoom-controls", "graph-zoom-in", "graph-zoom-out", "graph-zoom-fit", "graph-zoom-100", "graph-zoom-percent"]) {
    assert.ok(controls.includes(`data-testid="${id}"`), `testid ${id}`);
  }
  assert.match(controls, /<svg/);
  assert.doesNotMatch(controls, /[🔍🔎➕➖⛶🔣]/u, "без эмодзи-иконок");
  for (const key of ["graph.zoomIn", "graph.zoomOut", "graph.zoomFit", "graph.zoom100", "graph.minimap", "graph.zoomGroup"]) {
    assert.ok(ru.includes(`"${key}"`), `ru: ${key}`);
    assert.ok(en.includes(`"${key}"`), `en: ${key}`);
  }
});

test("Z1-3: wheel-zoom non-passive + pan по фону + сброс вида по resetKey", () => {
  assert.match(hook, /addEventListener\("wheel", onWheel, \{ passive: false \}\)/);
  assert.match(hook, /event\.preventDefault\(\)/);
  assert.match(hook, /useEffect\(\(\) => \{ setUserView\(null\); \}, \[resetKey\]\)/);
  assert.match(hook, /event\.target !== svg/, "pan стартует только на фоне канваса");
  assert.match(overlay, /useViewBoxZoom\(\{ fitView, resetKey, svgRef \}\)/);
  assert.match(overlay, /onPointerDown=\{zoom\.panStart\}/);
  assert.match(overlay, /viewBox=\{zoom\.viewBox\}/);
  assert.match(overlay, /data-testid="graph-canvas-svg"/);
  // pan интегрирован в существующие pointer-хендлеры и подавляет click после сдвига
  assert.match(overlay, /zoom\.panMove\(event\)/);
  assert.match(overlay, /zoom\.panEnd\(\)/);
});

test("Z1-4: миникарта только при >50 узлах, без новых зависимостей", () => {
  assert.match(zoomMath, /MINIMAP_NODE_THRESHOLD = 50/);
  assert.match(overlay, /minimapNodes\.length > MINIMAP_NODE_THRESHOLD/);
  assert.match(minimap, /data-testid="graph-minimap"/);
  assert.match(minimap, /graph-minimap-viewport/);
  const pkg = read("../../package.json");
  assert.doesNotMatch(pkg, /minimap|d3-zoom|panzoom/i, "новых зависимостей быть не должно");
});

test("Z1-5: навигация замечаний — центрирование zoom-вида вместо scrollIntoView", () => {
  assert.match(overlay, /focusNodeId = ""/);
  assert.match(overlay, /focusSeq = 0/);
  assert.match(overlay, /zoom\.focusOn\(c\.cx, c\.cy/);
  assert.match(ws, /focusNodeId=\{focusTarget\?\.id \|\| ""\}/);
  assert.match(ws, /resetKey=\{`\$\{asIsSource\?\.sessionId \|\| ""\}:\$\{templateId\}`\}/);
  assert.doesNotMatch(ws, /el\.scrollIntoView/, "scrollIntoView больше не используется (скролла в зоне нет)");
});

test("Z1-6: палитра STRUCTURAL_BLOCKS — i18n в обоих потребителях, без RU-hardcode", () => {
  assert.doesNotMatch(ws, /Развилка «|Событие «/, "Workspace.jsx без RU-hardcode подписей палитры");
  assert.doesNotMatch(ctor, /Развилка «|Событие «/, "Constructor.jsx без RU-hardcode подписей палитры");
  assert.match(ws, /getStructuralBlocks\(\)/);
  assert.match(ctor, /getStructuralBlocks\(\{ withIntermediate: true \}\)/);
  assert.match(blocks, /t\("ctor\.block\.exclusiveGateway"\)/);
  for (const key of ["ctor.block.exclusiveGateway", "ctor.block.parallelGateway", "ctor.block.startEvent", "ctor.block.endEvent", "ctor.block.intermediateCatchEvent"]) {
    assert.ok(ru.includes(`"${key}"`), `ru: ${key}`);
    assert.ok(en.includes(`"${key}"`), `en: ${key}`);
  }
});
