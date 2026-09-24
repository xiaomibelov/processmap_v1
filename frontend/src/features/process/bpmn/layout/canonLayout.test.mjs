import test from "node:test";
import assert from "node:assert/strict";

import {
  CANON_LAYOUT,
  computeCanonLayout,
  roundTo10,
} from "./canonLayout.js";

// Acceptance-регрессия из постановки:
// старт → 3 таски → XOR → таска → финиш + петля «no» (XOR → task2).
// Исходные координаты НЕ канонические (разбросаны, размеры не канон),
// после align всё должно соответствовать канону.

function buildAcceptanceInput() {
  const nodes = [
    { id: "start", type: "bpmn:StartEvent", x: 137, y: 141, width: 36, height: 36 },
    { id: "t1", type: "bpmn:Task", x: 300, y: 500, width: 120, height: 70 },
    { id: "t2", type: "bpmn:Task", x: 90, y: 20, width: 200, height: 100 },
    { id: "t3", type: "bpmn:Task", x: 999, y: 333, width: 100, height: 60 },
    { id: "xor", type: "bpmn:ExclusiveGateway", x: 40, y: 700, width: 40, height: 40 },
    { id: "t4", type: "bpmn:Task", x: 555, y: 88, width: 140, height: 90 },
    { id: "end", type: "bpmn:EndEvent", x: 20, y: 10, width: 34, height: 34 },
  ];
  const flows = [
    { id: "f1", sourceId: "start", targetId: "t1" },
    { id: "f2", sourceId: "t1", targetId: "t2" },
    { id: "f3", sourceId: "t2", targetId: "t3" },
    { id: "f4", sourceId: "t3", targetId: "xor" },
    { id: "f5", sourceId: "xor", targetId: "t4" },
    { id: "f6", sourceId: "t4", targetId: "end" },
    { id: "loop_no", sourceId: "xor", targetId: "t2" },
  ];
  return { nodes, flows };
}

test("roundTo10: кратность 10", () => {
  assert.equal(roundTo10(137), 140);
  assert.equal(roundTo10(134), 130);
  assert.equal(roundTo10(-14), -10);
  assert.equal(roundTo10(0), 0);
  assert.equal(roundTo10(195), 200);
});

test("канон: старт → 3 таски → XOR → таска → финиш + петля «no»", () => {
  const { positions, backEdges, axisOrder } = computeCanonLayout(buildAcceptanceInput());

  // Топологический порядок оси от стартового события.
  assert.deepEqual(axisOrder, ["start", "t1", "t2", "t3", "xor", "t4", "end"]);

  // Y0 = округлённый centerY стартового события: 141 + 36/2 = 159 → 160.
  const Y0 = 160;
  // x0 = округлённый x старта: 137 → 140.
  const x0 = 140;
  const GAP = CANON_LAYOUT.GAP;

  // Канонические размеры.
  const expected = {
    start: { width: 56, height: 56 },
    t1: { width: 130, height: 80 },
    t2: { width: 130, height: 80 },
    t3: { width: 130, height: 80 },
    xor: { width: 50, height: 50 },
    t4: { width: 130, height: 80 },
    end: { width: 56, height: 56 },
  };

  const xs = {};
  let cursor = x0;
  for (const id of ["start", "t1", "t2", "t3", "xor", "t4", "end"]) {
    const pos = positions.get(id);
    assert.ok(pos, `position for ${id}`);
    assert.equal(pos.width, expected[id].width, `${id} width`);
    assert.equal(pos.height, expected[id].height, `${id} height`);
    assert.equal(pos.x, cursor, `${id} x`);
    assert.equal(pos.y, Y0 - pos.height / 2, `${id} y (centerY == Y0)`);
    xs[id] = cursor;
    cursor = roundTo10(cursor + pos.width + GAP);
  }

  // Координаты кратны 10 (x нод и все точки петель).
  for (const [id, pos] of positions) {
    assert.equal(pos.x % 10, 0, `${id}: x=${pos.x} кратно 10`);
  }

  // Петля «no» — back-edge, не двигает ноды и разводится ортогонально
  // на лейне Y0 + 200.
  assert.deepEqual(backEdges, ["loop_no"]);
  const laneY = Y0 + CANON_LAYOUT.LOOP_LANE_FIRST_OFFSET;
  const waypoints = computeCanonLayout(buildAcceptanceInput()).loopWaypoints.get("loop_no");
  assert.ok(waypoints, "waypoints for loop_no");
  // xor: centerX = xs.xor + 25, bottom = Y0 + 25; t2: centerX = xs.t2 + 65, bottom = Y0 + 40.
  // Точки петель округлены до кратных 10.
  const xorCenterX = roundTo10(xs.xor + 25);
  const t2CenterX = roundTo10(xs.t2 + 65);
  assert.deepEqual(
    waypoints.map((p) => [p.x, p.y]),
    [
      [xorCenterX, roundTo10(Y0 + 25)],
      [xorCenterX, laneY],
      [t2CenterX, laneY],
      [t2CenterX, roundTo10(Y0 + 40)],
    ],
  );
  for (const p of waypoints) {
    assert.equal(p.x % 10, 0, `wp.x=${p.x} кратно 10`);
    assert.equal(p.y % 10, 0, `wp.y=${p.y} кратно 10`);
  }
});

test("канон: каждая следующая параллельная петля получает лейн +80", () => {
  // Две петли из xor с ПЕРЕКРЫВАЮЩИМСЯ x-интервалом → второй лейн Y0+280.
  const input = buildAcceptanceInput();
  input.flows.push({ id: "loop_no_2", sourceId: "xor", targetId: "t3" });
  const { loopWaypoints } = computeCanonLayout(input);
  const wp1 = loopWaypoints.get("loop_no");
  const wp2 = loopWaypoints.get("loop_no_2");
  assert.ok(wp1 && wp2);
  const lane1 = wp1[1].y;
  const lane2 = wp2[1].y;
  assert.equal(lane2 - lane1, CANON_LAYOUT.LOOP_LANE_STEP);
});

test("канон: непересекающиеся петли могут делить лейн (без наложений)", () => {
  const input = {
    nodes: [
      { id: "s", type: "bpmn:StartEvent", x: 100, y: 100, width: 56, height: 56 },
      { id: "a1", type: "bpmn:Task", x: 300, y: 100, width: 130, height: 80 },
      { id: "a2", type: "bpmn:Task", x: 600, y: 100, width: 130, height: 80 },
      { id: "g", type: "bpmn:ExclusiveGateway", x: 900, y: 100, width: 50, height: 50 },
      { id: "e", type: "bpmn:EndEvent", x: 1200, y: 100, width: 56, height: 56 },
    ],
    flows: [
      { id: "f1", sourceId: "s", targetId: "a1" },
      { id: "f2", sourceId: "a1", targetId: "a2" },
      { id: "f3", sourceId: "a2", targetId: "g" },
      { id: "f4", sourceId: "g", targetId: "e" },
      // Петля g→a1: интервал [a1.x, g.x].
      { id: "l1", sourceId: "g", targetId: "a1" },
      // Петля e→e (self-loop) за пределами x-интервала l1 → общий лейн.
      { id: "l2", sourceId: "e", targetId: "e" },
    ],
  };
  const { loopWaypoints } = computeCanonLayout(input);
  const wp1 = loopWaypoints.get("l1");
  const wp2 = loopWaypoints.get("l2");
  assert.ok(wp1 && wp2);
  // Self-loop точечная — интервальное перекрытие отсутствует: общий лейн.
  assert.equal(wp1[1].y, wp2[1].y);
});

test("канон: ноды вне достижимости от старта — хвост оси, без наложений", () => {
  const input = {
    nodes: [
      { id: "s", type: "bpmn:StartEvent", x: 100, y: 100, width: 56, height: 56 },
      { id: "t", type: "bpmn:Task", x: 400, y: 100, width: 130, height: 80 },
      { id: "orphan", type: "bpmn:Task", x: 800, y: 400, width: 130, height: 80 },
    ],
    flows: [{ id: "f1", sourceId: "s", targetId: "t" }],
  };
  const { positions, axisOrder } = computeCanonLayout(input);
  assert.deepEqual(axisOrder, ["s", "t", "orphan"]);
  const t = positions.get("t");
  const orphan = positions.get("orphan");
  assert.equal(orphan.x, t.x + t.width + CANON_LAYOUT.GAP);
  assert.equal(orphan.y, t.y);
});
