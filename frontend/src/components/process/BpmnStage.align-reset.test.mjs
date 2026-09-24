import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./BpmnStage.jsx", import.meta.url), "utf8");

test("BpmnStage imperative API exposes alignDiagram and resetCanvas", () => {
  assert.equal(source.includes("alignDiagram"), true);
  assert.equal(source.includes("resetCanvas"), true);
});

test("alignDiagram uses one commandStack handler, no layoutConnection, persists XML and fits viewport", () => {
  assert.match(source, /modeling\s*[=:]\s*inst\.get\s*\(\s*["']modeling["']\s*\)/);
  assert.match(source, /fpc\.alignDiagram/);
  assert.match(source, /laneRowAlign/);
  const alignStart = source.indexOf("async function alignDiagramOnInstance");
  const alignEnd = source.indexOf("function resetCanvasOnInstance");
  const alignBody = alignStart >= 0 && alignEnd > alignStart ? source.slice(alignStart, alignEnd) : "";
  assert.ok(alignBody.length > 0, "align body slice found");
  assert.equal(alignBody.includes("layoutConnection"), false, "no layoutConnection in align");
  assert.equal(alignBody.includes("updateWaypoints"), false, "no updateWaypoints in align");
  assert.equal(alignBody.includes("moveElements"), false, "no moveElements in align");
  assert.match(source, /saveXML|getRuntimeXmlSnapshot/);
  assert.match(source, /fit-viewport|safeFit/);
});

test("resetCanvas clears modeler and resets runtime state", () => {
  assert.match(source, /modeler\.clear\(\)|inst\.clear\(\)/);
  assert.match(source, /applyXmlSnapshot(?:\?\.)?\s*\(\s*["']\s*["']\s*,\s*["']reset_canvas["']\s*\)/);
});
