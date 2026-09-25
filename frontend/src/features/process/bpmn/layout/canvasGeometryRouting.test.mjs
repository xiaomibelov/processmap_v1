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

// --- anchor spreading (контур fix/canvas-geometry-routing-gateway-fan) ---

function gatewayFanPool() {
  // Минимальная модель дефекта «Лагмана»: fan-in×2 + fan-out×1 через шлюз G.
  const G = { x: 400, y: 300, width: 50, height: 50 };
  const A = { x: 100, y: 400, width: 130, height: 80 }; // cx 165 < G.cx → west
  const B = { x: 100, y: 180, width: 130, height: 80 }; // cx 165 < G.cx → west
  const C = { x: 280, y: 600, width: 130, height: 80 }; // cx 345 < G.cx → west (fan-out)
  const conns = [
    { id: "c1", sourceId: "A", targetId: "G", source: A, target: G },
    { id: "c2", sourceId: "B", targetId: "G", source: B, target: G },
    { id: "c3", sourceId: "G", targetId: "C", source: G, target: C },
  ];
  return { G, A, B, C, conns };
}

function routeFanPool(conns) {
  const occupied = new Set();
  const anchorRegistry = new Map();
  const anchorOccupied = new Set();
  const out = new Map();
  for (const conn of conns.sort((a, b) => a.id.localeCompare(b.id))) {
    const foreignRects = conns
      .filter((c) => c !== conn)
      .flatMap((c) => [c.source, c.target])
      .filter((r) => r !== conn.source && r !== conn.target);
    const pts = routeConnection({
      source: conn.source,
      target: conn.target,
      foreignRects,
      occupied,
      sourceId: conn.sourceId,
      targetId: conn.targetId,
      anchorRegistry,
      anchorOccupied,
    });
    out.set(conn.id, pts);
  }
  return out;
}

test("gateway-fan: fan-in×2 + fan-out×1 через одну сторону — якоря разнесены ≥10px, 0 конфликтов", () => {
  const { G, conns } = gatewayFanPool();
  const routed = routeFanPool(conns);
  const anchorsOnG = [];
  for (const [id, pts] of routed) {
    assert.ok(pts, `связь ${id} разведена`);
    const onG = id === "c3" ? pts[0] : pts[pts.length - 1];
    anchorsOnG.push({ id, p: onG });
    // якорь на грани G
    const onFace = (onG.x === G.x || onG.x === G.x + G.width ||
      onG.y === G.y || onG.y === G.y + G.height) &&
      onG.x >= G.x && onG.x <= G.x + G.width && onG.y >= G.y && onG.y <= G.y + G.height;
    assert.ok(onFace, `якорь связи ${id} на грани G`);
  }
  for (let i = 0; i < anchorsOnG.length; i += 1) {
    for (let j = i + 1; j < anchorsOnG.length; j += 1) {
      const d = Math.hypot(
        anchorsOnG[i].p.x - anchorsOnG[j].p.x,
        anchorsOnG[i].p.y - anchorsOnG[j].p.y,
      );
      assert.ok(
        d >= ROUTING_GRID,
        `якоря ${anchorsOnG[i].id}/${anchorsOnG[j].id} разнесены ≥10px (факт ${d})`,
      );
    }
  }
  assert.equal(findChannelConflicts(routed).length, 0, "канал-конфликтов нет");
});

test("gateway-fan: детерминизм — повторный прогон пула даёт те же маршруты", () => {
  const { conns } = gatewayFanPool();
  const first = routeFanPool(conns.map((c) => ({ ...c })));
  const second = routeFanPool(conns.map((c) => ({ ...c })));
  assert.deepEqual([...second.values()], [...first.values()]);
});

test("gateway-fan: занятые якоря — hard-block, реестр освобождается удалением claim'ов", () => {
  const { G, A, B } = gatewayFanPool();
  const occupied = new Set();
  const anchorRegistry = new Map();
  const anchorOccupied = new Set();
  const claims2 = [];
  const p1 = routeConnection({
    source: A, target: G, foreignRects: [], occupied,
    sourceId: "A", targetId: "G", anchorRegistry, anchorOccupied,
  });
  assert.ok(p1);
  const anchor1 = p1[p1.length - 1];
  // та же точка привязки для второй связи → занята (registry + occupied-ячея)
  const p2 = routeConnection({
    source: B, target: G, foreignRects: [], occupied,
    sourceId: "B", targetId: "G", anchorRegistry, anchorOccupied, anchorClaims: claims2,
  });
  assert.ok(p2, "вторая связь разводится соседним слотом");
  const anchor2 = p2[p2.length - 1];
  assert.ok(
    Math.hypot(anchor1.x - anchor2.x, anchor1.y - anchor2.y) >= ROUTING_GRID,
    "второй якорь не совпадает с первым",
  );
  // откат (как releaseOccupancy в плане): claim'ы удалены → слот снова свободен
  for (const c of claims2) {
    const set = anchorRegistry.get(c.key);
    if (set) { set.delete(c.value); if (set.size === 0) anchorRegistry.delete(c.key); }
  }
  const p3 = routeConnection({
    source: B, target: G, foreignRects: [], occupied: new Set(),
    sourceId: "B", targetId: "G", anchorRegistry, anchorOccupied: new Set(),
  });
  assert.ok(p3);
  const anchor3 = p3[p3.length - 1];
  assert.deepEqual(anchor3, anchor2, "после освобождения claim'ов освободившийся слот снова доступен");
});

test("gateway-fan: короткая грань — слоты схлопнуты, связь уходит на другую сторону (не падает)", () => {
  // событие 36×36: inset GRID даёт диапазон [y+10, y+26] — три уникальных слота
  const E = { x: 400, y: 300, width: 36, height: 36 };
  const sources = [0, 1, 2, 3].map((i) => ({ x: 100, y: 260 + i * 60, width: 130, height: 80 }));
  const occupied = new Set();
  const anchorRegistry = new Map();
  const anchorOccupied = new Set();
  const anchors = [];
  for (let i = 0; i < sources.length; i += 1) {
    const pts = routeConnection({
      source: sources[i], target: E, foreignRects: [], occupied,
      sourceId: `S${i}`, targetId: "E", anchorRegistry, anchorOccupied,
    });
    assert.ok(pts, `fan-in ${i} разведён (fallback-сторона или слот)`);
    const a = pts[pts.length - 1];
    anchors.push(a);
    const onFace = a.x >= E.x && a.x <= E.x + E.width && a.y >= E.y && a.y <= E.y + E.height &&
      (a.x === E.x || a.x === E.x + E.width || a.y === E.y || a.y === E.y + E.height);
    assert.ok(onFace, `якорь ${i} на грани E`);
  }
  for (let i = 0; i < anchors.length; i += 1) {
    for (let j = i + 1; j < anchors.length; j += 1) {
      const d = Math.hypot(anchors[i].x - anchors[j].x, anchors[i].y - anchors[j].y);
      assert.ok(d > 0, "якоря не совпадают (кламп может давать <10px — инвариант: 0 канал-конфликтов)");
    }
  }
  assert.ok(anchors.length === 4);
});
