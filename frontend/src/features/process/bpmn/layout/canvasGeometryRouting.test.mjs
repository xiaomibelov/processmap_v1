// canvasGeometryRouting.test.mjs — unit-тесты grid-A* роутера контура
// fix/canvas-geometry-apply-routing.
import test from "node:test";
import assert from "node:assert/strict";

import {
  computeExitCorridor,
  routeConnection,
  findChannelConflicts,
  validateConnectionGeometry,
  ROUTING_GRID,
} from "./canvasGeometryRouting.js";

function task(id, x, y, w = 130, h = 80) {
  return { id, type: "bpmn:Task", x, y, width: w, height: h };
}
const rect = (n) => ({ x: n.x, y: n.y, width: n.width, height: n.height });

function assertValidRoute(pts, s, t, foreign) {
  assert.ok(Array.isArray(pts) && pts.length >= 2, "маршрут есть, ≥2 точек");
  for (const p of pts) {
    assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y), "целые координаты");
    assert.ok(p.x % ROUTING_GRID === 0 && p.y % ROUTING_GRID === 0, "каналы кратны сетке 10");
  }
  for (let i = 1; i < pts.length; i += 1) {
    assert.ok(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y, `сегмент ${i} ортогонален`);
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  assert.ok(
    (Math.abs(first.x - (s.x + s.width)) <= 1 || Math.abs(first.x - s.x) <= 1 ||
     Math.abs(first.y - (s.y + s.height)) <= 1 || Math.abs(first.y - s.y) <= 1),
    "первая точка на границе источника"
  );
  assert.ok(
    (Math.abs(last.x - (t.x + t.width)) <= 1 || Math.abs(last.x - t.x) <= 1 ||
     Math.abs(last.y - (t.y + t.height)) <= 1 || Math.abs(last.y - t.y) <= 1),
    "последняя точка на границе цели"
  );
  for (const f of foreign) {
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1]; const b = pts[i];
      const inside = (p) => p.x > f.x && p.x < f.x + f.width && p.y > f.y && p.y < f.y + f.height;
      assert.ok(!inside(a) && !inside(b), `точка внутри препятствия ${f.id || ""}`);
      // пересечение сегмента с ВНУТРЕННОСТЬЮ препятствия
      const cross = !(Math.max(a.x, b.x) < f.x || Math.min(a.x, b.x) > f.x + f.width ||
                      Math.max(a.y, b.y) < f.y || Math.min(a.y, b.y) > f.y + f.height);
      if (cross) {
        // точный чек: сегмент входит внутрь (не только касается грани)
        const clipped = Math.max(a.x, b.x) > f.x && Math.min(a.x, b.x) < f.x + f.width &&
                        Math.max(a.y, b.y) > f.y && Math.min(a.y, b.y) < f.y + f.height;
        assert.ok(!clipped, `сегмент ${i} проходит сквозь препятствие ${f.id || ""}`);
      }
    }
  }
}

test("роутер: чистое поле → прямой/одно-поворотный маршрут, точки на границах", () => {
  const s = rect(task("s", 0, 0));
  const t = rect(task("t", 400, 60));
  const pts = routeConnection({ source: s, target: t, foreignRects: [], occupied: new Set() });
  assertValidRoute(pts, s, t, []);
  const len = pts.reduce((acc, p, i) => i ? acc + Math.abs(p.x - pts[i - 1].x) + Math.abs(p.y - pts[i - 1].y) : 0, 0);
  const man = Math.abs(pts[pts.length - 1].x - pts[0].x) + Math.abs(pts[pts.length - 1].y - pts[0].y);
  assert.equal(len, man, "кратчайший маршрут");
});

test("роутер: обход одиночного препятствия на оси", () => {
  const s = rect(task("s", 0, 100));
  const t = rect(task("t", 500, 100));
  const wall = rect(task("M", 250, 90));
  const pts = routeConnection({ source: s, target: t, foreignRects: [wall], occupied: new Set() });
  assertValidRoute(pts, s, t, [wall]);
});

test("роутер: обход стены (маршрут огибает, есть повороты, сегменты вне стены)", () => {
  const s = rect(task("s", 0, 100));
  const t = rect(task("t", 600, 100));
  // сплошная стена из 5 блокирующих прямоугольников между s и t
  const wall = [0, 1, 2, 3, 4].map((i) => rect(task(`w${i}`, 240, 40 + i * 60, 140, 40)));
  const pts = routeConnection({ source: s, target: t, foreignRects: wall, occupied: new Set() });
  assertValidRoute(pts, s, t, wall);
  assert.ok(pts.length >= 3, "маршрут огибает стену минимум одним поворотом");
});

test("роутер: тупик (цель полностью окружена) → null (честный пропуск)", () => {
  const s = rect(task("s", 0, 0));
  const t = rect(task("t", 400, 0));
  const cage = [
    { x: 300, y: -80, width: 260, height: 60 },   // сверху
    { x: 300, y: 100, width: 260, height: 60 },   // снизу
    { x: 560, y: -80, width: 60, height: 240 },   // справа
    { x: 240, y: -80, width: 60, height: 240 },   // слева (перекрывает и стартовый коридор)
  ];
  const pts = routeConnection({ source: s, target: t, foreignRects: cage, occupied: new Set() });
  assert.equal(pts, null);
});

test("роутер: occupancy — вторая связь не повторяет канал первой", () => {
  const s1 = rect(task("s1", 0, 0)); const t1 = rect(task("t1", 400, 0));
  const s2 = rect(task("s2", 0, 200)); const t2 = rect(task("t2", 400, 200));
  const occupied = new Set();
  const pts1 = routeConnection({ source: s1, target: t1, foreignRects: [], occupied });
  const pts2 = routeConnection({ source: s2, target: t2, foreignRects: [], occupied });
  assertValidRoute(pts1, s1, t1, []);
  assertValidRoute(pts2, s2, t2, []);
  const conflicts = findChannelConflicts(new Map([["a", pts1], ["b", pts2]]));
  assert.deepEqual(conflicts, [], "каналы разнесены ≥10px");
});

test("роутер: исчерпание бюджета → null", () => {
  const s = rect(task("s", 0, 0));
  const t = rect(task("t", 5000, 0)); // далеко → много расширений
  const pts = routeConnection({
    source: s, target: t, foreignRects: [], occupied: new Set(), expansionBudget: 50,
  });
  assert.equal(pts, null);
});

test("validate: отклоняет схлопывание в точку и оторванный endpoint", () => {
  const s = rect(task("s", 0, 0));
  const t = rect(task("t", 300, 0));
  const v1 = validateConnectionGeometry({ source: s, target: t, waypoints: [{ x: 130, y: 40 }], foreignRects: [] });
  assert.equal(v1.ok, false);
  const v2 = validateConnectionGeometry({ source: s, target: t, waypoints: [{ x: 130, y: 40 }, { x: 999, y: 999 }], foreignRects: [] });
  assert.equal(v2.ok, false);
  const v3 = validateConnectionGeometry({ source: s, target: t, waypoints: [{ x: 130, y: 40 }, { x: 300, y: 40 }], foreignRects: [] });
  assert.equal(v3.ok, true);
});

test("findChannelConflicts: коллинеарное совпадение и близкий параллельный канал", () => {
  const coincident = findChannelConflicts(new Map([
    ["a", [{ x: 0, y: 100 }, { x: 400, y: 100 }]],
    ["b", [{ x: 200, y: 100 }, { x: 600, y: 100 }]],
  ]));
  assert.equal(coincident.length, 1);
  const close = findChannelConflicts(new Map([
    ["a", [{ x: 0, y: 100 }, { x: 400, y: 100 }]],
    ["b", [{ x: 0, y: 105 }, { x: 400, y: 105 }]],
  ]));
  assert.equal(close.length, 1, "параллельные на 5px — конфликт");
  const far = findChannelConflicts(new Map([
    ["a", [{ x: 0, y: 100 }, { x: 400, y: 100 }]],
    ["b", [{ x: 0, y: 130 }, { x: 400, y: 130 }]],
  ]));
  assert.equal(far.length, 0, "параллельные на 30px — норма");
  const crossing = findChannelConflicts(new Map([
    ["a", [{ x: 0, y: 100 }, { x: 400, y: 100 }]],
    ["b", [{ x: 200, y: 0 }, { x: 200, y: 300 }]],
  ]));
  assert.equal(crossing.length, 0, "перпендикулярное пересечение стрелок — норма BPMN");
});

// --- boundary-host: коридор выхода (контур fix/canvas-geometry-routing-boundary-host) ---

// Коридор — штатный экспорт routing-модуля (единый источник для роутера и валидации).

function collectBodyOutsideCorridor(pts, host, corridor, ownRect = null) {
  const allowed = (p) => (corridor && p.x >= corridor.x && p.x <= corridor.x + corridor.width &&
    p.y >= corridor.y && p.y <= corridor.y + corridor.height) ||
    (ownRect && p.x >= ownRect.x && p.x <= ownRect.x + ownRect.width &&
     p.y >= ownRect.y && p.y <= ownRect.y + ownRect.height);
  const bad = [];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    // сегмент, пересекающий ВНУТРЕННОСТЬ хоста, обязан быть целиком в разрешённой зоне
    const clipped = Math.max(a.x, b.x) > host.x && Math.min(a.x, b.x) < host.x + host.width &&
                    Math.max(a.y, b.y) > host.y && Math.min(a.y, b.y) < host.y + host.height;
    if (clipped && !(allowed(a) && allowed(b))) bad.push([a, b]);
  }
  return bad;
}
const assertNoBodyOutsideCorridor = Object.assign(
  (pts, host, corridor, ownRect = null) => {
    const bad = collectBodyOutsideCorridor(pts, host, corridor, ownRect);
    assert.deepEqual(bad, [], `сегменты телом хоста вне коридора: ${JSON.stringify(bad)}`);
  },
  { collect: collectBodyOutsideCorridor }
);

test("boundary-host characterization: без хоста в foreign (семантика v1.0.157) маршрут идёт телом — мотивация коридора", () => {
  // boundary на нижней грани хоста, цель прямо над ним. Воспроизводит n1 #1044:
  // bbox-wide исключение хоста допускало проход телом. Тест-сторож: фиксирует,
  // ЧТО именно запрещает коридор (на старом поведении bad > 0).
  const host = { x: 0, y: 0, width: 200, height: 100 };
  const be = { x: 90, y: 90, width: 20, height: 20 };
  const t = { x: 50, y: -80, width: 100, height: 80 };
  const pts = routeConnection({ source: be, target: t, foreignRects: [], occupied: new Set() });
  assert.ok(pts, "маршрут есть");
  const corridor = computeExitCorridor(host, pts[0]);
  assert.ok(corridor, "коридор определён");
  const before = assertNoBodyOutsideCorridor.collect(pts, host, corridor, be);
  assert.ok(before.length > 0, "без хоста в foreign маршрут проходит телом (класс бага подтверждён)");
});

test("boundary-host GREEN-API: хост в foreignRects + exitHost → выход только через коридор", () => {
  const host = { x: 0, y: 0, width: 200, height: 100 };
  const be = { x: 90, y: 90, width: 20, height: 20 };
  const t = { x: 50, y: -80, width: 100, height: 80 };
  const pts = routeConnection({ source: be, target: t, foreignRects: [host], exitHost: host, occupied: new Set() });
  assert.ok(pts, "маршрут разводится через коридор");
  const corridor = computeExitCorridor(host, pts[0]);
  assert.ok(corridor, "коридор выхода определён");
  assertNoBodyOutsideCorridor(pts, host, corridor, be);
});

test("computeExitCorridor: ось ближайшей грани, ширина 1 ячейка по обе стороны", () => {
  const host = { x: 0, y: 0, width: 200, height: 100 };
  const south = computeExitCorridor(host, { x: 100, y: 100 });
  assert.deepEqual(south, { x: 90, y: 100, width: 30, height: 20 });
  const east = computeExitCorridor(host, { x: 200, y: 50 });
  assert.deepEqual(east, { x: 200, y: 40, width: 20, height: 30 });
  const north = computeExitCorridor(host, { x: 60, y: 0 });
  assert.deepEqual(north, { x: 50, y: -20, width: 30, height: 20 });
  assert.equal(computeExitCorridor(host, { x: 100, y: 50 }), null, "якорь внутри тела — коридора нет");
});

test("validate: hostExits — тело хоста вне коридора invalid, коридор ок, грань ок", () => {
  const host = { x: 0, y: 0, width: 200, height: 100 };
  const corridor = { x: 90, y: 100, width: 30, height: 20 };
  const base = { source: { x: 90, y: 90, width: 20, height: 20 }, target: { x: 300, y: 120, width: 100, height: 80 } };
  const hostExits = [{ host, corridor }];
  const throughBody = validateConnectionGeometry({
    ...base, foreignRects: [host], hostExits,
    waypoints: [{ x: 100, y: 90 }, { x: 100, y: 20 }, { x: 300, y: 20 }],
  });
  assert.equal(throughBody.ok, false, "сквозь тело вне коридора — invalid");
  const viaCorridor = validateConnectionGeometry({
    ...base, foreignRects: [host], hostExits,
    waypoints: [{ x: 100, y: 100 }, { x: 100, y: 120 }, { x: 300, y: 120 }],
  });
  assert.equal(viaCorridor.ok, true, "выход через коридор — ok");
  const alongEdge = validateConnectionGeometry({
    ...base, foreignRects: [host], hostExits,
    waypoints: [{ x: 100, y: 100 }, { x: 180, y: 100 }, { x: 180, y: 160 }, { x: 300, y: 160 }],
  });
  assert.equal(alongEdge.ok, true, "скольжение по грани хоста — ок (не внутренность)");
  const noCorridor = validateConnectionGeometry({
    ...base, foreignRects: [host], hostExits: [{ host, corridor: null }],
    // точка строго внутри тела хоста вне коридора и вне тела boundary
    waypoints: [{ x: 100, y: 100 }, { x: 100, y: 80 }, { x: 300, y: 80 }],
  });
  assert.equal(noCorridor.ok, false, "corridor:null → проход по телу хоста invalid (fail-closed)");
});

test("boundary-host: коридор занят occupied → null (честный пропуск)", () => {
  const host = { x: 0, y: 0, width: 200, height: 100 };
  const be = { x: 90, y: 90, width: 20, height: 20 };
  const t = { x: 50, y: -80, width: 100, height: 80 };
  // grid origin роутера (source/target, foreign пуст): minX=snap(50-100), minY=snap(-80-100)
  const minX = Math.round((Math.min(be.x, t.x) - 100) / 10) * 10;
  const minY = Math.round((Math.min(be.y, t.y) - 100) / 10) * 10;
  const occ3 = new Set();
  for (let y = 70; y <= 150; y += 10) {
    for (let x = 70; x <= 150; x += 10) occ3.add(`${(x - minX) / 10},${(y - minY) / 10}`);
  }
  const pts = routeConnection({ source: be, target: t, foreignRects: [], exitHost: host, occupied: occ3 });
  assert.equal(pts, null, "тупик: коридор и выходы заняты → null");
});
