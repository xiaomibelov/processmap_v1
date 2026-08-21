import test from "node:test";
import assert from "node:assert/strict";
import {
  matrixToDiagram,
  matrixToScreen,
  parseSvgMatrix,
} from "./hybridCoords.js";

test("parseSvgMatrix: parses matrix transform", () => {
  const matrix = parseSvgMatrix("matrix(1.2 0 0 1.2 40 22)");
  assert.equal(matrix.a, 1.2);
  assert.equal(matrix.d, 1.2);
  assert.equal(matrix.e, 40);
  assert.equal(matrix.f, 22);
});

test("matrixToScreen/matrixToDiagram: invert roundtrip", () => {
  const matrix = { a: 1.35, b: 0, c: 0, d: 1.35, e: 120, f: 88 };
  const source = { x: 240, y: 160 };
  const screen = matrixToScreen(matrix, source.x, source.y);
  const back = matrixToDiagram(matrix, screen.x, screen.y);
  assert.ok(Math.abs(back.x - source.x) < 0.0001);
  assert.ok(Math.abs(back.y - source.y) < 0.0001);
});

test("matrixToDiagram: falls back on degenerate matrix", () => {
  const point = matrixToDiagram({ a: 0, b: 0, c: 0, d: 0, e: 10, f: 10 }, 25, 35);
  assert.deepEqual(point, { x: 15, y: 25 });
});
