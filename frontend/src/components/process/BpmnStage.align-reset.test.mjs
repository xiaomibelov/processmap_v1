import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./BpmnStage.jsx", import.meta.url), "utf8");
// fix/canvas-apply-persist-validation: FpcAlignDiagramHandler перенесён в
// canvasGeometryApplyInstance.js (headless-тестируемый bpmn-js-вайринг);
// хендлер-гейты читают источник оттуда.
const instanceSource = fs.readFileSync(
  new URL("../../features/process/bpmn/layout/canvasGeometryApplyInstance.js", import.meta.url),
  "utf8",
);

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

test("align handler reads DI via diagram element only (no businessObject.di)", () => {
  // bpmn-js: доступ к di через businessObject падает бросающим геттером
  // ("Tried to access di from the businessObject"); DI — только через
  // diagram-элемент (element.di / connection.di).
  const handlerStart = instanceSource.indexOf("function FpcAlignDiagramHandler");
  const handlerEnd = instanceSource.indexOf("async function applyGeometryOnInstance");
  const handlerBody = handlerStart >= 0 && handlerEnd > handlerStart
    ? instanceSource.slice(handlerStart, handlerEnd)
    : "";
  assert.ok(handlerBody.length > 0, "align handler slice found");
  assert.equal(
    handlerBody.includes("businessObject.di"),
    false,
    "no businessObject.di in align handler (bpmn-js throwing getter)",
  );
  assert.match(handlerBody, /\bel\.di\b/);
  assert.match(handlerBody, /\bconn\.di\b/);
  assert.match(handlerBody, /\brec\.el\.di\b/);
});

test("align handler DI-waypoint моддл-безопасен (reroute/revert через diWaypointFactory)", () => {
  // fix/canvas-apply-persist-validation FIX A: plain-{x,y} splice в
  // di.waypoint ломал saveXML (moddle-xml 'isGeneric'); DI-waypoint теперь
  // создаются через moddle-фабрику и в execute, и в revert.
  const handlerStart = instanceSource.indexOf("function FpcAlignDiagramHandler");
  const handlerEnd = instanceSource.indexOf("async function applyGeometryOnInstance");
  const handlerBody = instanceSource.slice(handlerStart, handlerEnd);
  assert.ok(handlerBody.includes("diWaypointFactory"), "handler uses diWaypointFactory");
  assert.match(handlerBody, /diTemplate/);
  const factoryStart = instanceSource.indexOf("function diWaypointFactory");
  assert.ok(factoryStart >= 0, "diWaypointFactory present");
  const factoryBody = instanceSource.slice(factoryStart, handlerStart);
  assert.match(factoryBody, /\$model\.create|\bmodel\.create/);
});
