// canvasGeometryApplyTopology.test.mjs — golden-тесты контура
// fix/canvas-geometry-apply-topology.
//
// Фикстура — синтетическая топология баг-репорта v1.0.155 (см.
// __fixtures__/geometryApplyTopology.mjs). Инвариант фикса (PLAN.md §3):
// применение настроек НЕ ухудшает существующий layout — y-координаты и
// относительный порядок узлов сохраняются, никакой глобальной перекладки
// рядов и курсорного сжатия.

import test from "node:test";
import assert from "node:assert/strict";

import * as applyModule from "./canvasGeometryApply.js";

const { computeGeometryApplyPlan, computeReroutedWaypoints } = applyModule;
import {
  nodes as FIXTURE_NODES,
  connections as FIXTURE_CONNECTIONS,
  TOPOLOGY_GEOMETRY,
} from "./__fixtures__/geometryApplyTopology.mjs";

const G = TOPOLOGY_GEOMETRY;
const MAIN_CHAIN = ["start", "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "J", "end"];
const HORIZONTAL_FLOW_IDS = ["c_start", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c_T10_J", "c_J_end"];

function buildPlan() {
  return computeGeometryApplyPlan(
    { nodes: FIXTURE_NODES, connections: FIXTURE_CONNECTIONS },
    G
  );
}

// Финальные прямоугольники: план побеждает, иначе исходная геометрия.
function finalRects(plan) {
  const rects = new Map();
  for (const n of FIXTURE_NODES) {
    const p = plan.positions.get(n.id);
    rects.set(n.id, p ? { ...p } : { x: n.x, y: n.y, width: n.width, height: n.height });
  }
  return rects;
}

// Применённый сдвиг по x: финальный x минус x той же фигуры без сдвига
// (для тасок — центр-якорный ресайз даёт базовый x без сдвига).
function appliedShift(node, rect) {
  const baseX = node.x + node.width / 2 - rect.width / 2;
  return rect.x - baseX;
}

function centerX(rect) { return rect.x + rect.width / 2; }
function centerY(rect) { return rect.y + rect.height / 2; }

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height;
}

function onRectBoundary(p, r) {
  const onV = (p.x === r.x || p.x === r.x + r.width) && p.y >= r.y && p.y <= r.y + r.height;
  const onH = (p.y === r.y || p.y === r.y + r.height) && p.x >= r.x && p.x <= r.x + r.width;
  return onV || onH;
}

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) {
    len += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
  }
  return len;
}

// --- golden: инварианты layout ---

test("golden: centerY всех узлов после apply неизменны", () => {
  const plan = buildPlan();
  const rects = finalRects(plan);
  for (const n of FIXTURE_NODES) {
    const r = rects.get(n.id);
    assert.equal(centerY(r), n.y + n.height / 2, `${n.id}: centerY затёрт (y ${n.y} -> ${r.y})`);
  }
});

test("golden: относительный порядок главной цепочки по x сохранён", () => {
  const plan = buildPlan();
  const rects = finalRects(plan);
  for (let i = 1; i < MAIN_CHAIN.length; i += 1) {
    const prev = centerX(rects.get(MAIN_CHAIN[i - 1]));
    const cur = centerX(rects.get(MAIN_CHAIN[i]));
    assert.ok(cur > prev, `${MAIN_CHAIN[i - 1]} -> ${MAIN_CHAIN[i]}: порядок нарушен (${prev} >= ${cur})`);
  }
});

test("golden: нет пересечений bbox у пар, не связанных flow-ребром", () => {
  const plan = buildPlan();
  const rects = finalRects(plan);
  const linked = new Set();
  for (const c of FIXTURE_CONNECTIONS) linked.add(`${c.sourceId}|${c.targetId}`);
  const attached = new Map(FIXTURE_NODES.filter((n) => n.attachedTo).map((n) => [n.id, n.attachedTo]));
  for (const a of FIXTURE_NODES) {
    for (const b of FIXTURE_NODES) {
      if (a.id >= b.id) continue;
      if (linked.has(`${a.id}|${b.id}`) || linked.has(`${b.id}|${a.id}`)) continue;
      if (attached.get(a.id) === b.id || attached.get(b.id) === a.id) continue;
      assert.ok(
        !rectsOverlap(rects.get(a.id), rects.get(b.id)),
        `${a.id} ∩ ${b.id} после применения`
      );
    }
  }
});

test("golden: зазор каждого горизонтального flow-ребра = sequenceGap ±1", () => {
  const plan = buildPlan();
  const rects = finalRects(plan);
  const byId = new Map(FIXTURE_CONNECTIONS.map((c) => [c.id, c]));
  for (const id of HORIZONTAL_FLOW_IDS) {
    const c = byId.get(id);
    const s = rects.get(c.sourceId);
    const t = rects.get(c.targetId);
    const gap = t.x - (s.x + s.width);
    assert.ok(Math.abs(gap - G.sequenceGap) <= 1, `${id}: зазор ${gap} ≠ ${G.sequenceGap}`);
  }
});

test("golden: вертикальные ветки едут с родителем, относительная геометрия сохранена", () => {
  const plan = buildPlan();
  const rects = finalRects(plan);
  const byId = new Map(FIXTURE_NODES.map((n) => [n.id, n]));
  const shift = (id) => appliedShift(byId.get(id), rects.get(id));
  assert.equal(shift("B1"), shift("T3"), "B1 наследует сдвиг T3");
  assert.equal(shift("B2"), shift("B1"), "B2 едет вместе с B1");
  assert.equal(shift("C1"), shift("T6"), "C1 наследует сдвиг T6");
  assert.equal(shift("C2"), shift("C1"), "C2 едет вместе с C1");
  // внутренние смещения веток не изменились
  assert.equal(rects.get("B2").x - rects.get("B1").x, byId.get("B2").x - byId.get("B1").x, "B-ветка: dx внутри ветки");
  assert.equal(rects.get("B2").y - rects.get("B1").y, byId.get("B2").y - byId.get("B1").y, "B-ветка: dy внутри ветки");
  assert.equal(rects.get("C2").y - rects.get("C1").y, byId.get("C2").y - byId.get("C1").y, "C-ветка: dy внутри ветки");
});

test("golden: boundary event следует за хостом", () => {
  const plan = buildPlan();
  const rects = finalRects(plan);
  const byId = new Map(FIXTURE_NODES.map((n) => [n.id, n]));
  assert.equal(appliedShift(byId.get("BE1"), rects.get("BE1")), appliedShift(byId.get("T5"), rects.get("T5")),
    "BE1 сдвинут на ту же дельту, что хост T5");
  assert.equal(rects.get("BE1").width, byId.get("BE1").width, "boundary не ресайзится");
  assert.equal(rects.get("BE1").y, byId.get("BE1").y, "boundary: y неизменен");
});

// --- golden: стрелки ---

test("golden: оба конца на одной дельте → чистая трансляция, без reroute", () => {
  const plan = buildPlan();
  const rects = finalRects(plan);
  const byId = new Map(FIXTURE_NODES.map((n) => [n.id, n]));
  const shift = (id) => appliedShift(byId.get(id), rects.get(id));
  for (const id of ["c_T3_B1", "c_B1_B2", "c_T6_C1", "c_C1_C2"]) {
    const tr = plan.connectionTranslations.get(id);
    assert.ok(tr, `${id}: ожидается translation`);
    assert.equal(tr.dy, 0, `${id}: dy всегда 0`);
    assert.ok(!plan.connectionWaypoints.has(id), `${id}: translation-ребро не должно reroute'иться`);
  }
  const tr = plan.connectionTranslations.get("c_T3_B1");
  assert.equal(tr.dx, shift("T3"), "c_T3_B1: дельта = сдвиг общий");
  assert.equal(plan.stats.connectionsTranslated, 4);
});

test("golden: rerouted waypoints — manhattan, целые, кроп к границам bbox концов", () => {
  const plan = buildPlan();
  const rects = finalRects(plan);
  const byId = new Map(FIXTURE_CONNECTIONS.map((c) => [c.id, c]));
  for (const [id, pts] of plan.connectionWaypoints) {
    const c = byId.get(id);
    const s = rects.get(c.sourceId);
    const t = rects.get(c.targetId);
    assert.ok(pts.length >= 2 && pts.length <= 4, `${id}: L/Z-маршрут, точек ${pts.length}`);
    for (const p of pts) {
      assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y), `${id}: целые координаты`);
    }
    for (let i = 1; i < pts.length; i += 1) {
      const axis = pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y;
      assert.ok(axis, `${id}: сегмент ${i} не ортогонален`);
    }
    assert.ok(onRectBoundary(pts[0], s), `${id}: первая точка на границе источника ${JSON.stringify(pts[0])} vs ${JSON.stringify(s)}`);
    assert.ok(onRectBoundary(pts[pts.length - 1], t), `${id}: последняя точка на границе цели`);
    const manhattan =
      Math.abs(pts[pts.length - 1].x - pts[0].x) + Math.abs(pts[pts.length - 1].y - pts[0].y);
    assert.equal(polylineLength(pts), manhattan, `${id}: маршрут не длиннее manhattan`);
  }
  assert.equal(plan.stats.connectionsRerouted, plan.connectionWaypoints.size);
});

// --- golden: stats / noop ---

test("golden: stats соответствует топологии; noop = false", () => {
  const plan = buildPlan();
  assert.equal(plan.noop, false);
  assert.equal(plan.stats.tasksResized, 16, "T1..T10, J, B1, B2, C1, C2, D1");
  assert.equal(plan.stats.nodesShifted, 17, "T1..T10, J, end, B1, B2, C1, C2, BE1");
  assert.equal(plan.stats.nodesSkipped, 0);
  assert.equal(plan.stats.connectionsTranslated, 4, "c_T3_B1, c_B1_B2, c_T6_C1, c_C1_C2");
  assert.equal(plan.stats.connectionsRerouted, 15, "остальные 15 рёбер с разными дельтами");
});

// --- safety: небезопасный сдвиг отменяется ---

test("safety: сдвиг, дающий пересечение с не-downstream узлом, отменяется (nodesSkipped)", () => {
  // A → B; C стоит справа так, что нормализация зазора B утянет его в C.
  // C не является downstream B → B пропускается, каскад продолжается.
  const nodes = [
    { id: "A", type: "bpmn:Task", x: 100, y: 100, width: 130, height: 80 },
    { id: "B", type: "bpmn:Task", x: 350, y: 100, width: 130, height: 80 },
    { id: "C", type: "bpmn:Task", x: 500, y: 100, width: 130, height: 80 },
  ];
  const connections = [
    { id: "ab", sourceId: "A", targetId: "B", waypoints: [{ x: 230, y: 140 }, { x: 400, y: 140 }] },
  ];
  const plan = computeGeometryApplyPlan({ nodes, connections }, { taskWidth: 170, taskHeight: 100, sequenceGap: 120 });
  // Пост-ресайз: A 80..250, B 330..500 (зазор 80), C 480..650. Дефицит 40
  // сдвинул бы B в 370..540 → пересечение с C (480..650), C не downstream B.
  const c = plan.positions.get("C");
  assert.equal(c.x, 480, "C: только ресайз, не сдвинут");
  const b = plan.positions.get("B");
  assert.equal(plan.stats.nodesSkipped, 1, "B пропущен");
  assert.equal(b.x, 330, "B: только ресайз, сдвиг 0");
  assert.equal(plan.positions.get("A").x, 80, "A: только ресайз");
});

// --- safety: regression review B1 — pinned не наследует сдвиг от upstream ---

test("safety-regression (B1): запиненный downstream не наследует сдвиг от upstream (ненулевой shift)", () => {
  // Цепочка S→A→B, блокирующий не-downstream C справа. Наследование сдвига
  // от A не должно вернуть сдвиг запиненному B (дефект review B1).
  const nodes = [
    { id: "S", type: "bpmn:Task", x: 100, y: 100, width: 130, height: 80 },
    { id: "A", type: "bpmn:Task", x: 360, y: 100, width: 130, height: 80 },
    { id: "B", type: "bpmn:Task", x: 640, y: 100, width: 130, height: 80 },
    { id: "C", type: "bpmn:Task", x: 820, y: 100, width: 130, height: 80 },
  ];
  const connections = [
    { id: "sa", sourceId: "S", targetId: "A", waypoints: [{ x: 230, y: 140 }, { x: 360, y: 140 }] },
    { id: "ab", sourceId: "A", targetId: "B", waypoints: [{ x: 490, y: 140 }, { x: 640, y: 140 }] },
  ];
  const plan = computeGeometryApplyPlan({ nodes, connections }, { taskWidth: 170, taskHeight: 100, sequenceGap: 120 });
  // Пост-ресайз: S 80..250, A 340..510, B 620..790, C 800..970.
  // shift(A)=30 (зазор 90), shift(B) был бы 40 → B+40=660..830 ∩ C(800..970)
  // → B пинится. Без фикса B1 наследование от A возвращало B сдвиг 30.
  assert.equal(plan.stats.nodesSkipped, 1, "B запинен ровно один раз");
  assert.equal(plan.stats.nodesShifted, 1, "сдвинут только A");
  assert.equal(plan.positions.get("A").x, 370, "A сдвинут на 30");
  assert.equal(plan.positions.get("B").x, 620, "B: только ресайз, наследованного сдвига нет");
  const b = plan.positions.get("B");
  const c = plan.positions.get("C");
  assert.ok(!(b.x + b.width > c.x && c.x + c.width > b.x), "пересечение B∩C исчезло");
  assert.equal(c.x, 800, "C не тронут");
});

// --- computeReroutedWaypoints: unit ---

test("computeReroutedWaypoints: target справа → выход восточный, вход западный, L-маршрут", () => {
  const s = { x: 100, y: 100, width: 170, height: 100 };
  const t = { x: 500, y: 100, width: 170, height: 100 };
  const pts = computeReroutedWaypoints(s, t);
  assert.deepEqual(pts, [{ x: 270, y: 150 }, { x: 500, y: 150 }]);
});

test("computeReroutedWaypoints: target справа-вверху → L через угол, точки на границах", () => {
  const s = { x: 100, y: 400, width: 170, height: 100 };
  const t = { x: 600, y: 100, width: 170, height: 100 };
  const pts = computeReroutedWaypoints(s, t);
  assert.deepEqual(pts[0], { x: 270, y: 450 }, "выход — восточная грань источника");
  assert.deepEqual(pts[pts.length - 1], { x: 600, y: 150 }, "вход — западная грань цели");
  assert.equal(polylineLength(pts), Math.abs(600 - 270) + Math.abs(150 - 450), "manhattan");
});

test("computeReroutedWaypoints: перекрытие по x (review m1) — ни одна точка не внутри чужого bbox", () => {
  const s = { x: 100, y: 100, width: 170, height: 100 }; // 100..270
  const t = { x: 200, y: 100, width: 360, height: 100 }; // 200..560, перекрытие 200..270
  const pts = computeReroutedWaypoints(s, t);
  const inside = (p, r) => p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
  for (const p of pts) {
    assert.ok(!inside(p, s), `точка ${JSON.stringify(p)} строго внутри источника`);
    assert.ok(!inside(p, t), `точка ${JSON.stringify(p)} строго внутри цели`);
  }
  assert.ok(onRectBoundary(pts[0], s), "первая точка на границе источника");
  assert.ok(onRectBoundary(pts[pts.length - 1], t), "последняя точка на границе цели");
  for (let i = 1; i < pts.length; i += 1) {
    assert.ok(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y, `сегмент ${i} не ортогонален`);
  }
});


// --- gate: один undo-шаг с reroute-стрелками; revert побайтово ---

// Стенд зеркалит контракт FpcAlignDiagramHandler (BpmnStage.jsx): connection op
// может нести waypoints (полная замена массива) или {dx,dy} (трансляция).
function makeHandlerStand() {
  const handler = {
    execute(context) {
      context.records = [];
      for (const op of context.shapeOps || []) {
        const el = op.element;
        const diBounds = el.di && el.di.bounds ? el.di.bounds : null;
        context.records.push({
          kind: "shape", el,
          x: el.x, y: el.y, width: el.width, height: el.height,
          di: diBounds ? { ...diBounds } : null,
        });
        el.x = op.x; el.y = op.y; el.width = op.width; el.height = op.height;
        if (diBounds) { diBounds.x = op.x; diBounds.y = op.y; diBounds.width = op.width; diBounds.height = op.height; }
      }
      for (const op of context.connectionOps || []) {
        const conn = op.element;
        const diW = conn.di && Array.isArray(conn.di.waypoint) ? conn.di.waypoint : null;
        context.records.push({
          kind: "connection", el: conn,
          waypoints: conn.waypoints.map((p) => ({ x: p.x, y: p.y })),
          diWaypoints: diW ? diW.map((p) => ({ x: p.x, y: p.y })) : null,
        });
        if (Array.isArray(op.waypoints)) {
          conn.waypoints.splice(0, conn.waypoints.length, ...op.waypoints.map((p) => ({ x: p.x, y: p.y })));
          if (diW) diW.splice(0, diW.length, ...op.waypoints.map((p) => ({ x: p.x, y: p.y })));
        } else {
          for (const p of conn.waypoints) { p.x += op.dx; p.y += op.dy; }
          if (diW) for (const p of diW) { p.x += op.dx; p.y += op.dy; }
        }
      }
    },
    revert(context) {
      for (const rec of context.records || []) {
        if (rec.kind === "shape") {
          rec.el.x = rec.x; rec.el.y = rec.y; rec.el.width = rec.width; rec.el.height = rec.height;
          if (rec.di && rec.el.di && rec.el.di.bounds) Object.assign(rec.el.di.bounds, rec.di);
        } else {
          rec.el.waypoints.splice(0, rec.el.waypoints.length, ...rec.waypoints.map((p) => ({ x: p.x, y: p.y })));
          if (rec.diWaypoints && rec.el.di && Array.isArray(rec.el.di.waypoint)) {
            rec.el.di.waypoint.splice(0, rec.el.di.waypoint.length, ...rec.diWaypoints.map((p) => ({ x: p.x, y: p.y })));
          }
        }
      }
    },
  };
  let executeCount = 0;
  const commandStack = {
    registerHandler(name, h) { this.handler = h; this.commandName = name; },
    execute(name, context) {
      executeCount += 1;
      this.commandName = name;
      handler.execute(context);
      this.lastContext = context;
    },
    undo() { handler.revert(this.lastContext); },
    get executeCount() { return executeCount; },
  };
  return { commandStack };
}

function cloneFixture() {
  const nodes = FIXTURE_NODES.map((n) => ({
    ...n,
    laneBounds: n.laneBounds ? { ...n.laneBounds } : undefined,
    di: { bounds: { x: n.x, y: n.y, width: n.width, height: n.height } },
  }));
  const connections = FIXTURE_CONNECTIONS.map((c) => ({
    id: c.id, sourceId: c.sourceId, targetId: c.targetId,
    waypoints: c.waypoints.map((p) => ({ x: p.x, y: p.y })),
    di: { waypoint: c.waypoints.map((p) => ({ x: p.x, y: p.y })) },
  }));
  return { nodes, connections };
}

function snapshotEls(els) {
  return els.map((el) => ({
    id: el.id,
    x: el.x, y: el.y, width: el.width, height: el.height,
    di: el.di && el.di.bounds ? { ...el.di.bounds } : null,
    diWaypoints: el.di && Array.isArray(el.di.waypoint) ? el.di.waypoint.map((p) => ({ x: p.x, y: p.y })) : null,
    waypoints: Array.isArray(el.waypoints) ? el.waypoints.map((p) => ({ x: p.x, y: p.y })) : null,
  }));
}

test("gate: один execute; undo возвращает геометрию и DI побайтово (вкл. rerouted waypoints)", () => {
  const { nodes, connections } = cloneFixture();
  const els = [...nodes, ...connections];
  const before = snapshotEls(els);

  const plan = computeGeometryApplyPlan(
    {
      nodes: nodes.map(({ di, ...n }) => n),
      connections: connections.map(({ di, ...c }) => c),
    },
    G
  );

  const { commandStack } = makeHandlerStand();
  commandStack.registerHandler("fpc.applyGeometry", {});
  const shapeOps = [];
  for (const [id, pos] of plan.positions) {
    const el = nodes.find((e) => e.id === id);
    shapeOps.push({ element: el, ...pos });
  }
  const connectionOps = [];
  for (const [id, tr] of plan.connectionTranslations) {
    if (!tr.dx && !tr.dy) continue;
    connectionOps.push({ element: connections.find((c) => c.id === id), dx: tr.dx, dy: tr.dy });
  }
  for (const [id, pts] of plan.connectionWaypoints || new Map()) {
    connectionOps.push({ element: connections.find((c) => c.id === id), waypoints: pts });
  }
  assert.ok(shapeOps.length > 0 && connectionOps.length > 0, "операции непустые");
  commandStack.execute("fpc.applyGeometry", { shapeOps, connectionOps });
  assert.equal(commandStack.executeCount, 1, "ровно один undo-шаг");

  commandStack.undo();
  const after = snapshotEls(els);
  assert.deepEqual(after, before, "после undo схема идентична исходной (вкл. DI и waypoints)");
});
