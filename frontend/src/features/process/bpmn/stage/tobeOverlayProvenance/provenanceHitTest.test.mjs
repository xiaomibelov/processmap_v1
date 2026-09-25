// provenanceHitTest — чистый hit-test по диаграмм-координатам (T7).
//
// Read-only подсветка происхождения на ghost-подложке AS IS: точка hover
// (координаты canvas editor'а) -> id ghost-элемента. Без DOM/diagram-js,
// кроме точечного адаптера hitTestGhostRegistry под интерфейс registry.
import test from "node:test";
import assert from "node:assert/strict";

import { hitTestRectId, hitTestGhostRegistry } from "./provenanceHitTest.js";

const RECTS = [
  { id: "AsIs_1", x: 0, y: 0, width: 100, height: 80 },
  { id: "AsIs_2", x: 200, y: 0, width: 100, height: 80 },
];

test("прямое попадание -> id rect", () => {
  assert.equal(hitTestRectId({ x: 50, y: 40 }, RECTS), "AsIs_1");
  assert.equal(hitTestRectId({ x: 250, y: 40 }, RECTS), "AsIs_2");
});

test("граница rect считается попаданием (включительно)", () => {
  assert.equal(hitTestRectId({ x: 100, y: 80 }, RECTS), "AsIs_1");
  assert.equal(hitTestRectId({ x: 0, y: 0 }, RECTS), "AsIs_1");
});

test("перекрытие -> ближайший к точке (внутри = 0), tie -> первый в массиве", () => {
  const overlapping = [
    { id: "Outer", x: 0, y: 0, width: 200, height: 200 },
    { id: "Inner", x: 50, y: 50, width: 20, height: 20 },
  ];
  // точка внутри обоих: обе на расстоянии 0 -> tie -> первый в массиве
  assert.equal(hitTestRectId({ x: 60, y: 60 }, overlapping), "Outer");
  // точка внутри Inner, снаружи Outer невозможно здесь; сдвинем точку за Inner:
  assert.equal(hitTestRectId({ x: 10, y: 10 }, overlapping), "Outer");
});

test("промах в пределах tolerance -> snap-to-nearest", () => {
  // точка правее AsIs_1 на 5 (tolerance по умолчанию 6)
  assert.equal(hitTestRectId({ x: 105, y: 40 }, RECTS), "AsIs_1");
  // точка левее AsIs_2 на 5 (tolerance по умолчанию 6)
  assert.equal(hitTestRectId({ x: 195, y: 40 }, RECTS), "AsIs_2");
});

test("вне всех расширенных границ -> null", () => {
  assert.equal(hitTestRectId({ x: 150, y: 40 }, RECTS), null);
  assert.equal(hitTestRectId({ x: 106, y: 40 }, RECTS), "AsIs_1"); // ровно на границе tolerance
  assert.equal(hitTestRectId({ x: 107, y: 40 }, RECTS), null); // за tolerance
});

test("пустой rects -> null; tolerance = 0 -> только прямые попадания", () => {
  assert.equal(hitTestRectId({ x: 50, y: 40 }, []), null);
  assert.equal(hitTestRectId({ x: 105, y: 40 }, RECTS, 0), null);
  assert.equal(hitTestRectId({ x: 50, y: 40 }, RECTS, 0), "AsIs_1");
});

test("negative width/height -> нормализация abs", () => {
  const flipped = [{ id: "Flip", x: 100, y: 80, width: -100, height: -80 }];
  assert.equal(hitTestRectId({ x: 50, y: 40 }, flipped), "Flip");
  assert.equal(hitTestRectId({ x: 105, y: 40 }, flipped), "Flip"); // snap к правой границе x=100
});

test("защита от мусора: нечисловые bounds пропускаются", () => {
  const dirty = [
    { id: "Bad1", x: "a", y: 0, width: 10, height: 10 },
    { id: "Bad2", x: 0, y: 0, width: NaN, height: 10 },
    { id: "Good", x: 0, y: 0, width: 100, height: 100 },
  ];
  assert.equal(hitTestRectId({ x: 50, y: 50 }, dirty), "Good");
});

test("hitTestGhostRegistry: фейковый registry (forEach + di.bounds)", () => {
  const elements = [
    { id: "Ghost_1", businessObject: { di: { bounds: { x: 0, y: 0, width: 100, height: 80 } } } },
    { id: "Ghost_2", businessObject: { di: { bounds: { x: 200, y: 0, width: 100, height: 80 } } } },
    { id: "Ghost_no_di", businessObject: {} },
  ];
  const registry = {
    forEach(fn) {
      for (const el of elements) fn(el);
    },
  };
  assert.equal(hitTestGhostRegistry({ x: 50, y: 40 }, registry), "Ghost_1");
  assert.equal(hitTestGhostRegistry({ x: 250, y: 40 }, registry), "Ghost_2");
  assert.equal(hitTestGhostRegistry({ x: 150, y: 40 }, registry), null);
  // элемент без di.bounds не падает и не участвует
  assert.equal(hitTestGhostRegistry({ x: 50, y: 40 }, registry, 0), "Ghost_1");
});

test("hitTestGhostRegistry: пустой registry -> null", () => {
  const registry = { forEach(fn) {} };
  assert.equal(hitTestGhostRegistry({ x: 50, y: 40 }, registry), null);
});
