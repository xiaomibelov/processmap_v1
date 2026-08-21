import test from "node:test";
import assert from "node:assert/strict";

import {
  DRAWIO_EMPTY_DOC_XML,
  drawioDocXmlContainsElementId,
  promoteRuntimeElementIntoDrawioDoc,
  readDrawioDocXmlCellGeometry,
  updateDrawioDocXmlCellGeometry,
  updateDrawioDocXmlCellStyle,
  updateDrawioDocXmlCellValue,
} from "./drawioDocXml.js";

test("drawio doc promotion: bootstraps empty doc and inserts runtime rect id", () => {
  const promoted = promoteRuntimeElementIntoDrawioDoc("", {
    elementId: "rect_runtime_1",
    toolId: "rect",
    point: { x: 220, y: 140 },
  });
  assert.equal(String(promoted).startsWith("<mxfile"), true);
  assert.equal(drawioDocXmlContainsElementId(promoted, "rect_runtime_1"), true);
  assert.equal(/<mxGeometry\b[^>]*x="160"[^>]*y="110"[^>]*width="120"[^>]*height="60"/.test(promoted), true);
});

test("drawio doc promotion: appends missing runtime id into existing mxGraphModel root", () => {
  const promoted = promoteRuntimeElementIntoDrawioDoc(DRAWIO_EMPTY_DOC_XML, {
    elementId: "text_runtime_1",
    toolId: "text",
    point: { x: 320, y: 180 },
  });
  assert.equal(drawioDocXmlContainsElementId(promoted, "text_runtime_1"), true);
  assert.equal(/<mxCell\b[^>]*id="text_runtime_1"[^>]*parent="1"[^>]*vertex="1"/.test(promoted), true);
});

test("drawio doc promotion: same runtime id is not duplicated on repeated promotion", () => {
  const first = promoteRuntimeElementIntoDrawioDoc(DRAWIO_EMPTY_DOC_XML, {
    elementId: "container_runtime_1",
    toolId: "container",
    point: { x: 360, y: 240 },
  });
  const second = promoteRuntimeElementIntoDrawioDoc(first, {
    elementId: "container_runtime_1",
    toolId: "container",
    point: { x: 360, y: 240 },
  });
  const matches = second.match(/<mxCell\b[^>]*id="container_runtime_1"/g) || [];
  assert.equal(matches.length, 1);
});

test("drawio doc promotion: runtime text value can be updated without changing cell id", () => {
  const promoted = promoteRuntimeElementIntoDrawioDoc(DRAWIO_EMPTY_DOC_XML, {
    elementId: "text_runtime_2",
    toolId: "text",
    point: { x: 320, y: 180 },
  });
  const updated = updateDrawioDocXmlCellValue(promoted, "text_runtime_2", "Session label");
  assert.equal(drawioDocXmlContainsElementId(updated, "text_runtime_2"), true);
  assert.equal(/<mxCell\b[^>]*id="text_runtime_2"[^>]*value="Session label"/.test(updated), true);
});

test("drawio doc promotion: runtime shape style can be updated without changing cell id", () => {
  const promoted = promoteRuntimeElementIntoDrawioDoc(DRAWIO_EMPTY_DOC_XML, {
    elementId: "rect_runtime_2",
    toolId: "rect",
    point: { x: 200, y: 120 },
  });
  const updated = updateDrawioDocXmlCellStyle(promoted, "rect_runtime_2", {
    fillColor: "#d1fae5",
    strokeColor: "#059669",
  });
  assert.equal(drawioDocXmlContainsElementId(updated, "rect_runtime_2"), true);
  assert.equal(/<mxCell\b[^>]*id="rect_runtime_2"[^>]*style="[^"]*fillColor=#d1fae5;[^"]*strokeColor=#059669;/.test(updated), true);
});

test("drawio doc promotion: runtime geometry can be updated without changing cell id", () => {
  const promoted = promoteRuntimeElementIntoDrawioDoc(DRAWIO_EMPTY_DOC_XML, {
    elementId: "rect_runtime_3",
    toolId: "rect",
    point: { x: 200, y: 120 },
  });
  const updated = updateDrawioDocXmlCellGeometry(promoted, "rect_runtime_3", {
    width: 240,
    height: 96,
  });
  assert.equal(drawioDocXmlContainsElementId(updated, "rect_runtime_3"), true);
  assert.equal(String(updated).includes('width="240"'), true);
  assert.equal(String(updated).includes('height="96"'), true);
  const matches = updated.match(/<mxCell\b[^>]*id="rect_runtime_3"/g) || [];
  assert.equal(matches.length, 1);
});

test("drawio doc promotion: geometry can be read back for same text id", () => {
  const promoted = promoteRuntimeElementIntoDrawioDoc(DRAWIO_EMPTY_DOC_XML, {
    elementId: "text_runtime_3",
    toolId: "text",
    point: { x: 200, y: 120 },
  });
  assert.deepEqual(readDrawioDocXmlCellGeometry(promoted, "text_runtime_3"), {
    x: 200,
    y: 120,
    width: 120,
    height: 30,
  });
});
