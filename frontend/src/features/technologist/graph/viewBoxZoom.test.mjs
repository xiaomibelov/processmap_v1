// Z1 TOBE-UX: pure-математика viewBox zoom/pan. Запуск: node --test src/features/technologist/graph/viewBoxZoom.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import {
  MIN_VIEW_WIDTH,
  centerOn,
  formatViewBox,
  panBy,
  parseViewBox,
  zoomAroundCenter,
  zoomAroundPoint,
  zoomPercent,
  zoomToActualSize,
} from "./viewBoxZoom.js";

const FIT = { x: -40, y: -40, w: 8290, h: 620 };

test("parse/format viewBox — round-trip", () => {
  assert.deepEqual(parseViewBox("-40 -40 8290 620"), FIT);
  assert.equal(formatViewBox(FIT), "-40 -40 8290 620");
  assert.deepEqual(parseViewBox(""), { x: 0, y: 0, w: 100, h: 100 });
});

test("zoomAroundCenter: factor 2 — размеры вдвое меньше, центр на месте", () => {
  const z = zoomAroundCenter(FIT, 2);
  assert.equal(z.w, FIT.w / 2);
  assert.equal(z.h, FIT.h / 2);
  assert.equal(z.x + z.w / 2, FIT.x + FIT.w / 2);
  assert.equal(z.y + z.h / 2, FIT.y + FIT.h / 2);
});

test("zoomAroundPoint: точка под курсором неподвижна", () => {
  const px = 1000;
  const py = 200;
  const z = zoomAroundPoint(FIT, 1.5, px, py);
  // точка (px,py) в старом и новом виде имеет одинаковую относительную позицию
  assert.ok(Math.abs((px - z.x) / z.w - (px - FIT.x) / FIT.w) < 1e-9);
  assert.ok(Math.abs((py - z.y) / z.h - (py - FIT.y) / FIT.h) < 1e-9);
});

test("zoomAroundPoint: клампы minW и maxW", () => {
  const zIn = zoomAroundPoint(FIT, 1e9, 0, 0, { minW: MIN_VIEW_WIDTH });
  assert.equal(zIn.w, MIN_VIEW_WIDTH);
  const zOut = zoomAroundPoint(FIT, 1 / 1e9, 0, 0, { maxW: 10000 });
  assert.equal(zOut.w, 10000);
});

test("panBy: сдвиг вида без смены размера", () => {
  const p = panBy(FIT, 100, -50);
  assert.deepEqual(p, { ...FIT, x: FIT.x + 100, y: FIT.y - 50 });
});

test("zoomToActualSize: ширина вида = ширине контейнера, центр сохранён", () => {
  const z = zoomToActualSize(FIT, 1200, 700);
  assert.equal(z.w, 1200);
  assert.equal(z.h, 700);
  assert.equal(z.x + z.w / 2, FIT.x + FIT.w / 2);
});

test("centerOn: из fit зумится к читаемой ширине вокруг узла; при глубоком zoom не отдаляется", () => {
  const fromFit = centerOn(FIT, 500, 300, 800, FIT.w);
  assert.equal(fromFit.w, 800);
  assert.equal(fromFit.x + fromFit.w / 2, 500);
  assert.equal(fromFit.y + fromFit.h / 2, 300);
  const deep = { x: 0, y: 0, w: 400, h: 300 };
  const kept = centerOn(deep, 500, 300, 800, FIT.w);
  assert.equal(kept.w, 400, "текущий (более глубокий) zoom сохраняется");
  // не шире fit
  const clamped = centerOn({ ...FIT, w: FIT.w }, 0, 0, 99999, FIT.w);
  assert.equal(clamped.w, FIT.w);
});

test("zoomPercent: 100% при fit, 200% при двойном приближении", () => {
  assert.equal(zoomPercent(FIT, FIT), 100);
  assert.equal(zoomPercent(zoomAroundCenter(FIT, 2), FIT), 200);
  assert.equal(zoomPercent(FIT, null), 100);
});
