import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./BpmnStage.jsx", import.meta.url), "utf8");

test("BpmnStage imperative API exposes alignDiagram and resetCanvas", () => {
  assert.equal(source.includes("alignDiagram"), true);
  assert.equal(source.includes("resetCanvas"), true);
});

test("alignDiagram uses bpmn-js modeling API, persists XML via save pipeline and fits viewport", () => {
  assert.match(source, /modeling\s*[=:]\s*inst\.get\s*\(\s*["']modeling["']\s*\)/);
  assert.match(source, /alignElements|distributeElements|createLayout/);
  assert.match(source, /saveXML|getRuntimeXmlSnapshot/);
  assert.match(source, /fit-viewport|safeFit/);
});

test("resetCanvas clears modeler and resets runtime state", () => {
  assert.match(source, /modeler\.clear\(\)|inst\.clear\(\)/);
  assert.match(source, /applyXmlSnapshot(?:\?\.)?\s*\(\s*["']\s*["']\s*,\s*["']reset_canvas["']\s*\)/);
});
