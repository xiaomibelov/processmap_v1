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

test("align handler reads DI via diagram element only (no businessObject.di)", () => {
  // bpmn-js: доступ к di через businessObject падает бросающим геттером
  // ("Tried to access di from the businessObject"); DI — только через
  // diagram-элемент (element.di / connection.di).
  const handlerStart = source.indexOf("function FpcAlignDiagramHandler");
  const handlerEnd = source.indexOf("async function alignDiagramOnInstance");
  const handlerBody = handlerStart >= 0 && handlerEnd > handlerStart
    ? source.slice(handlerStart, handlerEnd)
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

test("applyGeometry: подписи следуют за владельцем через labelOps в том же шаге undo", () => {
  // Контур fix/canvas-geometry-labels-follow: label связи (translate/reroute)
  // и label узла собираются в labelOps и уходят одним commandStack.execute
  // вместе со shapeOps/connectionOps — один шаг undo на всё применение.
  const applyStart = source.indexOf("async function applyGeometryOnInstance");
  const applyEnd = source.indexOf("function resetCanvasOnInstance");
  const applyBody = applyStart >= 0 && applyEnd > applyStart
    ? source.slice(applyStart, applyEnd)
    : "";
  assert.ok(applyBody.length > 0, "apply body slice found");
  assert.match(applyBody, /layout\.shapeLabelDeltas/);
  assert.match(applyBody, /layout\.connectionLabelDeltas/);
  assert.match(applyBody, /layout\.connectionLabelPlacements/);
  assert.match(applyBody, /commandStack\.execute\(\s*["']fpc\.applyGeometry["'],\s*\{\s*shapeOps,\s*connectionOps,\s*labelOps\s*\}\s*\)/);
  // DI label — только через element.di (di.label.bounds); businessObject.di
  // бросающий геттер bpmn-js.
  assert.equal(applyBody.includes("businessObject.di"), false);
});
