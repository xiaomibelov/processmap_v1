import test from "node:test";
import assert from "node:assert/strict";
import { buildOverlayMatrixFromSnapshot } from "./useDiagramOverlayTransform.js";
import { matrixToDiagram, matrixToScreen } from "../utils/hybridCoords.js";

test("buildOverlayMatrixFromSnapshot derives matrix from viewbox and host rect", () => {
  const matrix = buildOverlayMatrixFromSnapshot(
    {
      width: 1200,
      height: 800,
      viewbox: {
        x: 100,
        y: 40,
        width: 600,
        height: 400,
      },
    },
    { width: 1200, height: 800 },
  );
  assert.equal(Math.round(matrix.a * 1000) / 1000, 2);
  assert.equal(Math.round(matrix.d * 1000) / 1000, 2);
  assert.equal(Math.round(matrix.e * 1000) / 1000, -200);
  assert.equal(Math.round(matrix.f * 1000) / 1000, -80);
});

test("buildOverlayMatrixFromSnapshot keeps invertibility for pan + zoom", () => {
  const matrix = buildOverlayMatrixFromSnapshot(
    {
      zoom: 1.5,
      viewbox: {
        x: 180,
        y: 60,
        width: 800,
        height: 520,
      },
    },
    { width: 1200, height: 780 },
  );
  const point = { x: 320, y: 240 };
  const screen = matrixToScreen(matrix, point.x, point.y);
  const back = matrixToDiagram(matrix, screen.x, screen.y);
  assert.ok(Math.abs(back.x - point.x) < 0.0001);
  assert.ok(Math.abs(back.y - point.y) < 0.0001);
});

test("buildOverlayMatrixFromSnapshot falls back to identity when snapshot is empty", () => {
  const matrix = buildOverlayMatrixFromSnapshot({}, {});
  assert.equal(matrix.a, 1);
  assert.equal(matrix.b, 0);
  assert.equal(matrix.c, 0);
  assert.equal(matrix.d, 1);
  assert.ok(Math.abs(Number(matrix.e || 0)) < 0.0001);
  assert.ok(Math.abs(Number(matrix.f || 0)) < 0.0001);
});
