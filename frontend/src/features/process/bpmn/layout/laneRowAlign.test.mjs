import test from "node:test";
import assert from "node:assert/strict";

import {
  computeLaneRowAlignPlan,
  roundTo10,
} from "./laneRowAlign.js";

// Acceptance: row-align строго внутри lane; запрет пересадки между пулами;
// translation waypoints (оба конца / один конец / разные дельты);
// singleton/подпроцессы untouched; кламп в границах лайна.

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function task(id, x, y, width = 120, height = 70, extra = {}) {
  return { id, type: "bpmn:Task", x, y, width, height, ...extra };
}

test("roundTo10", () => {
  assert.equal(roundTo10(137), 140);
  assert.equal(roundTo10(134), 130);
  assert.equal(roundTo10(0), 0);
});

test("ряд внутри lane: порядок по X, канон 130×80, зазор 100, медиана Y", () => {
  const nodes = [
    task("t3", 700, 130), // порядок в ряду по X: t1, t2, t3
    task("t1", 100, 103),
    task("t2", 400, 97),
  ].map((n) => ({ ...n, laneKey: "laneA" }));
  const { positions } = computeLaneRowAlignPlan({ nodes, connections: [] });

  // centerY: 138, 132, 165 → медиана 138 → Y = 140.
  const Y = roundTo10(median([138, 132, 165]));
  const x1 = roundTo10(100);
  assert.deepEqual(positions.get("t1"), { x: x1, y: Y - 40, width: 130, height: 80 });
  const x2 = roundTo10(x1 + 130 + 100);
  assert.deepEqual(positions.get("t2"), { x: x2, y: Y - 40, width: 130, height: 80 });
  const x3 = roundTo10(x2 + 130 + 100);
  assert.deepEqual(positions.get("t3"), { x: x3, y: Y - 40, width: 130, height: 80 });
});

test("группировка по lane: ноды разных лайнов выравниваются независимо (пересадка запрещена)", () => {
  const nodes = [
    task("a1", 100, 100, 120, 70, { laneKey: "laneA" }),
    task("a2", 500, 120, 120, 70, { laneKey: "laneA" }),
    task("b1", 100, 800, 120, 70, { laneKey: "laneB" }),
    task("b2", 500, 820, 120, 70, { laneKey: "laneB" }),
  ];
  const { positions } = computeLaneRowAlignPlan({ nodes, connections: [] });
  const Ya = roundTo10(median([135, 155]));
  const Yb = roundTo10(median([835, 855]));
  assert.equal(positions.get("a1").y, Ya - 40);
  assert.equal(positions.get("b1").y, Yb - 40);
  assert.notEqual(positions.get("a1").y, positions.get("b1").y);
});

test("кламп в laneBounds: нода не покидает границ лайна", () => {
  const laneBounds = { x: 0, y: 0, width: 400, height: 200 };
  const nodes = [
    task("t1", 100, 100, 130, 80, { laneKey: "laneA", laneBounds }),
    task("t2", 300, 110, 130, 80, { laneKey: "laneA", laneBounds }),
  ];
  const { positions } = computeLaneRowAlignPlan({ nodes, connections: [] });
  for (const [id, pos] of positions) {
    assert.ok(pos.x >= laneBounds.x + 10, `${id}: x=${pos.x} в лайне`);
    assert.ok(pos.x + pos.width <= laneBounds.x + laneBounds.width - 10, `${id}: правый край в лайне`);
    assert.ok(pos.y >= laneBounds.y + 10, `${id}: y=${pos.y} в лайне`);
    assert.ok(pos.y + pos.height <= laneBounds.y + laneBounds.height - 10, `${id}: низ в лайне`);
  }
});

test("одиночные ноды, подпроцессы и boundary events не трогаются", () => {
  const nodes = [
    task("single", 333, 777, 120, 70, { laneKey: "laneA" }),
    { id: "sub", type: "bpmn:SubProcess", x: 100, y: 100, width: 350, height: 200, laneKey: "laneA" },
    { id: "boundary", type: "bpmn:BoundaryEvent", x: 140, y: 280, width: 36, height: 36, laneKey: "laneA" },
    task("r1", 100, 400, 120, 70, { laneKey: "laneA" }),
    task("r2", 400, 410, 120, 70, { laneKey: "laneA" }),
  ];
  const { positions } = computeLaneRowAlignPlan({ nodes, connections: [] });
  assert.equal(positions.has("single"), false);
  assert.equal(positions.has("sub"), false);
  assert.equal(positions.has("boundary"), false);
  assert.ok(positions.has("r1") && positions.has("r2"));
});

test("translation waypoints: оба конца на одной дельте → все точки +дельта", () => {
  const nodes = [
    task("t1", 103, 100, 130, 80, { laneKey: "l" }),
    task("t2", 333, 100, 130, 80, { laneKey: "l" }),
  ];
  const connections = [{
    id: "c1", sourceId: "t1", targetId: "t2",
    waypoints: [{ x: 233, y: 140 }, { x: 300, y: 140 }, { x: 333, y: 140 }],
  }];
  const { positions, connectionTranslations } = computeLaneRowAlignPlan({ nodes, connections });
  const d1 = positions.get("t1").x - 103;
  const d2 = positions.get("t2").x - 333;
  assert.equal(d1, d2, "в этом примере дельты совпадают");
  const tr = connectionTranslations.get("c1");
  assert.ok(tr, "translation for c1");
  assert.equal(tr.dx, d1);
  assert.equal(tr.dy, 0);
});

test("translation waypoints: сдвинулся один конец → ломаная +дельта этого конца", () => {
  const nodes = [
    task("t1", 100, 100, 130, 80, { laneKey: "OTHER" }), // другой лайн — вне плана
    task("t2", 400, 90, 130, 80, { laneKey: "l" }),
    task("t3", 700, 130, 130, 80, { laneKey: "l" }),
  ];
  const connections = [
    { id: "edge_in", sourceId: "out", targetId: "t2", waypoints: [{ x: 0, y: 140 }, { x: 400, y: 140 }] },
  ];
  const { positions, connectionTranslations } = computeLaneRowAlignPlan({ nodes, connections });
  assert.equal(positions.has("t1"), false, "t1 в другом лайне — не трогаем");
  const dT = { dx: positions.get("t2").x - 400, dy: positions.get("t2").y - 90 };
  assert.notEqual(dT.dy, 0);
  const tr = connectionTranslations.get("edge_in");
  assert.ok(tr, "translation for edge_in");
  assert.deepEqual(tr, dT);
});

test("разные дельты концов → ломаная +дельта источника (детерминированно)", () => {
  const nodes = [
    task("s", 100, 96, 120, 70, { laneKey: "l" }),
    task("m", 350, 100, 120, 70, { laneKey: "l" }),
    task("t2", 600, 120, 120, 70, { laneKey: "l" }),
  ];
  const connections = [{
    id: "c", sourceId: "s", targetId: "t2",
    waypoints: [{ x: 220, y: 131 }, { x: 600, y: 131 }],
  }];
  const { positions, connectionTranslations } = computeLaneRowAlignPlan({ nodes, connections });
  const dS = { dx: positions.get("s").x - 100, dy: positions.get("s").y - 96 };
  const dT = { dx: positions.get("t2").x - 600, dy: positions.get("t2").y - 120 };
  assert.notDeepEqual(dS, dT);
  const tr = connectionTranslations.get("c");
  assert.deepEqual(tr, dS, "разные дельты → дельта источника");
});

test("нетронутые рёбра не попадают в translation-план", () => {
  const nodes = [
    task("a", 103, 100, 130, 80, { laneKey: "l" }),
    task("b", 333, 100, 130, 80, { laneKey: "l" }),
  ];
  const connections = [
    { id: "moved", sourceId: "a", targetId: "b", waypoints: [{ x: 233, y: 140 }, { x: 333, y: 140 }] },
    { id: "still", sourceId: "x", targetId: "y", waypoints: [{ x: 0, y: 0 }, { x: 50, y: 0 }] },
  ];
  const { connectionTranslations } = computeLaneRowAlignPlan({ nodes, connections });
  assert.equal(connectionTranslations.has("moved"), true);
  assert.equal(connectionTranslations.has("still"), false);
});

test("канонические размеры: событие Ø56, шлюз 50×50", () => {
  const nodes = [
    { id: "e1", type: "bpmn:StartEvent", x: 100, y: 100, width: 36, height: 36, laneKey: "l" },
    { id: "e2", type: "bpmn:EndEvent", x: 300, y: 100, width: 34, height: 34, laneKey: "l" },
  ];
  const { positions } = computeLaneRowAlignPlan({ nodes, connections: [] });
  const Y = roundTo10(median([118, 117]));
  assert.deepEqual(positions.get("e1"), { x: 100, y: Y - 28, width: 56, height: 56 });
  assert.deepEqual(positions.get("e2"), { x: roundTo10(100 + 56 + 100), y: Y - 28, width: 56, height: 56 });
  const gw = [
    { id: "g1", type: "bpmn:ExclusiveGateway", x: 100, y: 100, width: 40, height: 40, laneKey: "l" },
    { id: "g2", type: "bpmn:ExclusiveGateway", x: 300, y: 100, width: 40, height: 40, laneKey: "l" },
  ];
  const p2 = computeLaneRowAlignPlan({ nodes: gw, connections: [] }).positions;
  assert.equal(p2.get("g1").width, 50);
  assert.equal(p2.get("g1").height, 50);
});

test("порог 40: ноды с разрывом centerY > 40 — разные ряды, одиночные не трогаются", () => {
  const nodes = [
    task("a1", 100, 100, 130, 80, { laneKey: "l" }),
    task("a2", 400, 132, 130, 80, { laneKey: "l" }), // centerY 140 vs 172 → разрыв 32 < 40, один ряд
    task("b1", 700, 300, 130, 80, { laneKey: "l" }),
  ];
  const { positions } = computeLaneRowAlignPlan({ nodes, connections: [] });
  assert.ok(positions.has("a1") && positions.has("a2"));
  assert.equal(positions.has("b1"), false, "b1 одиночный в своём ряду — untouched");
});
