// tobeProvenanceHighlight — чистые функции обратной подсветки (T10):
// eventToDiagramPoint (client-координаты → точка диаграммы) и badgeKeyForCount
// (RU-плюрализация бейджа N→1). Node --test, без DOM: canvas — фейк-объект.
import test from "node:test";
import assert from "node:assert/strict";

import {
  badgeKeyForCount,
  eventToDiagramPoint,
} from "./tobeProvenanceHighlight.js";

test("eventToDiagramPoint: viewbox-математика (canvas без eventToCoordinates)", () => {
  const canvas = {
    viewbox: () => ({ x: 100, y: 50, width: 500, height: 400, scale: 2 }),
    getContainer: () => ({ getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 600 }) }),
  };
  const point = eventToDiagramPoint({ clientX: 30, clientY: 40 }, canvas);
  assert.deepEqual(point, { x: 110, y: 60 }); // 100+(30-10)/2, 50+(40-20)/2
});

test("eventToDiagramPoint: делегирует в eventToCoordinates, если метод есть", () => {
  const canvas = {
    eventToCoordinates: (event) => ({ x: event.clientX * 10, y: event.clientY * 10 }),
    viewbox: () => ({ x: 0, y: 0, scale: 1 }),
    getContainer: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }),
  };
  assert.deepEqual(eventToDiagramPoint({ clientX: 3, clientY: 4 }, canvas), { x: 30, y: 40 });
});

test("eventToDiagramPoint: бросок eventToCoordinates → fallback на viewbox-математику", () => {
  const canvas = {
    eventToCoordinates: () => {
      throw new Error("broken");
    },
    viewbox: () => ({ x: 0, y: 0, scale: 1 }),
    getContainer: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }),
  };
  assert.deepEqual(eventToDiagramPoint({ clientX: 7, clientY: 8 }, canvas), { x: 7, y: 8 });
});

test("badgeKeyForCount: RU-грамматика (1/2..4/много, 12..14 исключение)", () => {
  const cases = [
    [1, "badgeOne"],
    [2, "badgeFew"],
    [3, "badgeFew"],
    [4, "badgeFew"],
    [5, "badgeMany"],
    [11, "badgeMany"],
    [12, "badgeMany"],
    [14, "badgeMany"],
    [21, "badgeMany"],
    [22, "badgeFew"],
    [25, "badgeMany"],
    [101, "badgeMany"],
  ];
  for (const [n, expected] of cases) {
    assert.equal(badgeKeyForCount(n), expected, `n=${n}`);
  }
  // Никакого «1 тасок»: единственное число — только badgeOne.
  assert.notEqual(badgeKeyForCount(1), "badgeFew");
  assert.notEqual(badgeKeyForCount(1), "badgeMany");
});

test("source-guard: highlight-модуль read-only (0 мутаций модели)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const src = fs.readFileSync(
    path.resolve(process.cwd(), "src/features/process/bpmn/stage/tobeOverlayProvenance/tobeProvenanceHighlight.js"),
    "utf8",
  );
  const code = src.split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");
  assert.doesNotMatch(code, /commandStack/);
  assert.doesNotMatch(code, /modeling/);
  assert.doesNotMatch(code, /saveCoordinator/);
  assert.doesNotMatch(code, /apiGetBpmnXml|\/lib\/api/);
});
