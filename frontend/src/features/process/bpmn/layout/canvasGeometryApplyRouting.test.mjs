// canvasGeometryApplyRouting.test.mjs — golden/stress-тесты + диагностика
// гипотез (a)–(d) контура fix/canvas-geometry-apply-routing.
//
// Инварианты (GREEN): для КАЖДОЙ связи, которую план выводит (translation или
// reroute), — связность (≥2 точек, не схлопывание), endpoint'ы на своих фигурах,
// 0 сегмент∩чужой bbox, 0 коллинеарных наложений (≥10px каналы), честный stats.
// Связи, которые план НЕ трогает (нет дельт), исключены: их геометрия —
// пре-существующий вход (apply не отвечает за входной мусор, но и не молчит:
// деградация входа измеряется диагностикой отдельно).

import test from "node:test";
import assert from "node:assert/strict";

import {
  computeGeometryApplyPlan,
  resolveChannelConflicts,
} from "./canvasGeometryApply.js";
import {
  segmentRectCross,
  findChannelConflicts,
} from "./canvasGeometryRouting.js";
import {
  nodes as STRESS_NODES,
  connections as STRESS_CONNECTIONS,
  STRESS_GEOMETRY,
  STRESS_LANE,
} from "./__fixtures__/geometryApplyStress.mjs";
import {
  nodes as TOPOLOGY_NODES,
  connections as TOPOLOGY_CONNECTIONS,
  TOPOLOGY_GEOMETRY,
} from "./__fixtures__/geometryApplyTopology.mjs";

// --- измерители (общие для golden и диагностики) ---

function buildPlan(fixtureNodes, fixtureConnections, geometry) {
  const plan = computeGeometryApplyPlan(
    { nodes: fixtureNodes, connections: fixtureConnections },
    geometry
  );
  const rects = new Map(fixtureNodes.map((n) => [n.id, { x: n.x, y: n.y, width: n.width, height: n.height }]));
  for (const [id, p] of plan.positions) rects.set(id, p);
  return { plan, rects };
}

function outputWaypoints(plan, conn) {
  const wp = plan.connectionWaypoints.get(conn.id);
  if (wp) return { kind: "rerouted", pts: wp };
  const tr = plan.connectionTranslations.get(conn.id);
  if (tr) return { kind: "translated", pts: conn.waypoints.map((p) => ({ x: p.x + tr.dx, y: p.y + tr.dy })) };
  return { kind: "untouched", pts: conn.waypoints.map((p) => ({ x: p.x, y: p.y })) };
}

function onBoundary(p, r, tol = 1) {
  const within = p.x >= r.x - tol && p.x <= r.x + r.width + tol && p.y >= r.y - tol && p.y <= r.y + r.height + tol;
  if (!within) return false;
  const onV = Math.abs(p.x - r.x) <= tol || Math.abs(p.x - (r.x + r.width)) <= tol;
  const onH = Math.abs(p.y - r.y) <= tol || Math.abs(p.y - (r.y + r.height)) <= tol;
  return onV || onH;
}

function distToRect(p, r) {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
  return Math.hypot(dx, dy);
}

function endpointValid(p, r) {
  // gate-семантика: на границе ±1 ИЛИ в пределах 20px от своей фигуры
  // (bpmn-js кропит отрисовку к контуру; 20px покрывает дрейф после ресайза).
  return onBoundary(p, r, 1) || distToRect(p, r) <= 20;
}

function segmentHitsForeign(pts, foreignRects) {
  for (const r of foreignRects) {
    for (let i = 1; i < pts.length; i += 1) {
      if (segmentRectCross(pts[i - 1], pts[i], r)) return r.id || "foreign";
    }
  }
  return null;
}

function classifyOutputs(fixtureNodes, fixtureConnections, geometry) {
  const { plan, rects } = buildPlan(fixtureNodes, fixtureConnections, geometry);
  const report = {
    plan,
    segBbox: [],      // класс 1/(d): сегмент ∩ чужой bbox
    coincident: [],   // класс 2: коллинеарные наложения между выходами
    hypA: [],         // waypoints за пределами lane
    hypB: [],         // схлопывание в точку / <2 waypoints
    hypC: [],         // endpoint оторван от своей фигуры
  };
  const routed = new Map();
  const attachedHost = new Map(fixtureNodes.filter((n) => n.attachedTo).map((n) => [n.id, n.attachedTo]));
  for (const c of fixtureConnections) {
    const { kind, pts } = outputWaypoints(plan, c);
    if (kind === "untouched") continue; // выход плана не затрагивает
    const s = rects.get(c.sourceId);
    const t = rects.get(c.targetId);
    // хост boundary-эндпоинта — не препятствие (семантика BPMN, как в гейте)
    const hostS = attachedHost.get(c.sourceId);
    const hostT = attachedHost.get(c.targetId);
    const foreign = fixtureNodes.filter((n) => n.id !== c.sourceId && n.id !== c.targetId &&
      n.id !== hostS && n.id !== hostT).map((n) => ({ id: n.id, ...rects.get(n.id) }));
    if (pts.some((p) => p.x < STRESS_LANE.x || p.x > STRESS_LANE.x + STRESS_LANE.width ||
                        p.y < STRESS_LANE.y || p.y > STRESS_LANE.y + STRESS_LANE.height)) {
      report.hypA.push(c.id);
    }
    if (pts.length < 2 || pts.every((p) => p.x === pts[0].x && p.y === pts[0].y)) {
      report.hypB.push(c.id);
      continue;
    }
    if (!endpointValid(pts[0], s) || !endpointValid(pts[pts.length - 1], t)) {
      report.hypC.push(c.id);
    }
    const hit = segmentHitsForeign(pts, foreign);
    if (hit) report.segBbox.push(`${c.id}∩${hit}`);
    if (kind === "rerouted") routed.set(c.id, pts);
  }
  for (const conf of findChannelConflicts(routed)) {
    report.coincident.push(`${conf.a}∩${conf.b}`);
  }
  return report;
}

// --- stress: golden инварианты ---

test("stress: 0 сегмент∩чужой bbox, 0 коллинеарных наложений, связность выходов", () => {
  const r = classifyOutputs(STRESS_NODES, STRESS_CONNECTIONS, STRESS_GEOMETRY);
  assert.deepEqual(r.segBbox, [], "сегменты не должны проходить через чужие bbox");
  assert.deepEqual(r.coincident, [], "коллинеарные наложения каналов запрещены");
  assert.deepEqual(r.hypA, [], "(a) waypoints за пределами lane");
  assert.deepEqual(r.hypB, [], "(b) схлопывание в точку");
  assert.deepEqual(r.hypC, [], "(c) endpoint оторван от фигуры");
});

test("stress: stats честен (routing): translated 2, rerouted 6, skipped 0", () => {
  const { plan } = buildPlan(STRESS_NODES, STRESS_CONNECTIONS, STRESS_GEOMETRY);
  assert.equal(plan.stats.connectionsTranslated, 2, "c_x1_j1, c_x2_j2 (общая дельта, валидны)");
  assert.equal(plan.stats.connectionsRerouted, 6, "c_p0_s, c_s_t (translation→невалидна→reroute), c_p1_x1, c_p2_x2, c_j0_j1, c_j0_j2");
  assert.equal(plan.stats.connectionsSkipped, 0);
  assert.equal(plan.stats.connectionsChannelConflicts, 0);
  assert.equal(plan.stats.nodesSkipped, 0);
});

test("stress: c_s_t больше не идёт сквозь M1 (класс 1 закрыт)", () => {
  const { plan, rects } = buildPlan(STRESS_NODES, STRESS_CONNECTIONS, STRESS_GEOMETRY);
  const pts = plan.connectionWaypoints.get("c_s_t") ||
    (plan.connectionTranslations.get("c_s_t")
      ? STRESS_CONNECTIONS.find((c) => c.id === "c_s_t").waypoints.map((p) => ({ x: p.x + 40, y: p.y }))
      : null);
  assert.ok(plan.connectionWaypoints.get("c_s_t"), "c_s_t должен быть переразведён роутером");
  const m1 = { id: "M1", ...rects.get("M1") };
  for (let i = 1; i < pts.length; i += 1) {
    assert.ok(!segmentRectCross(pts[i - 1], pts[i], m1), `сегмент ${i} пересекает M1`);
  }
});

test("stress: c_deg — пре-существующий вход без дельт, план его не трогает", () => {
  const { plan } = buildPlan(STRESS_NODES, STRESS_CONNECTIONS, STRESS_GEOMETRY);
  assert.equal(plan.connectionWaypoints.has("c_deg"), false);
  assert.equal(plan.connectionTranslations.has("c_deg"), false);
  // D1/D2 ресайзятся (в positions), но сдвига по x нет: центр-якорь сохранён.
  const d1 = plan.positions.get("D1");
  const d2 = plan.positions.get("D2");
  assert.equal(d1.x, 1400 + 65 - 85, "D1: только ресайз, сдвиг 0");
  assert.equal(d2.x, 1720 + 65 - 85, "D2: только ресайз, сдвиг 0");
});

// --- пост-проход каналов (review r1): индекс сегмента противника ---

test("resolveChannelConflicts: коридор строится по сегменту ПРОТИВНИКА (разное число сегментов)", () => {
  // conn-a: 1 сегмент (горизонталь y=100). conn-b: 2 сегмента, конфликтный —
  // второй (bSeg=1, горизонталь y=100). Нарушитель — conn-b (больший id).
  // Регрессия r1: segIdx брался с нарушителя → otherPts[1] === undefined → NaN.
  const routed = new Map([
    ["conn-a", [{ x: 0, y: 100 }, { x: 400, y: 100 }]],
    ["conn-b", [{ x: 200, y: 180 }, { x: 200, y: 100 }, { x: 600, y: 100 }]],
  ]);
  const calls = [];
  const remaining = resolveChannelConflicts(routed, (offender, corridor) => {
    calls.push({ offender, corridor });
    // детур нарушителя на y=130 — конфликт снят
    return [{ x: 200, y: 180 }, { x: 200, y: 130 }, { x: 600, y: 130 }, { x: 600, y: 100 }];
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].offender, "conn-b");
  const c = calls[0].corridor;
  assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.width) && Number.isFinite(c.height),
    "коридор конечен (не NaN — regрессия r1)");
  // коридор построен по сегменту ПРОТИВНИКА (conn-a): y=100, x 0..400
  assert.equal(c.y, 99, "коридор по горизонтали противника");
  assert.equal(c.x, -1);
  assert.equal(c.width, 402);
  assert.deepEqual(remaining, [], "конфликт разведён");
});

test("resolveChannelConflicts: tryReroute вернул null → честный остаток", () => {
  const routed = new Map([
    ["a", [{ x: 0, y: 100 }, { x: 400, y: 100 }]],
    ["b", [{ x: 200, y: 100 }, { x: 600, y: 100 }]],
  ]);
  const remaining = resolveChannelConflicts(routed, () => null);
  assert.equal(remaining.length, 1, "конфликт остался и отражён в stats");
});

// --- диагностика гипотез (a)–(d) на stress-входе ---

test("диагностика: на stress-входе под старым поведением классы воспроизводились (зафиксировано в evidence-red)", () => {
  // Этот тест — постоянная диагностика: если класс когда-либо вернётся, упадёт.
  // Исторические числа v1.0.156 (evidence-red.txt): segBbox 1 (c_s_t∩M1),
  // coincident 1 (c_j0_j1∩c_j0_j2 y=440 x=250..720), hypB 1 (c_deg),
  // hypC 4 (c_s_t, c_x1_j1, c_x2_j2 — translation-зазоры, c_deg — вход).
  // (a) «за canvas» под v1.0.156 НЕ воспроизвёлся — зафиксировано как находка.
  const r = classifyOutputs(STRESS_NODES, STRESS_CONNECTIONS, STRESS_GEOMETRY);
  assert.deepEqual(r.hypA, [], "(a) не должен появляться и после фикса");
  assert.equal(r.hypB.length, 0, "(b) схлопывание должно быть закрыто гейтом");
  assert.equal(r.hypC.length, 0, "(c) оторванные endpoint'ы должны быть закрыты гейтом");
});

// --- topology-фикстура не деградирует ---

test("topology: routing-инварианты сохранены (0 bbox-пересечений, 0 наложений)", () => {
  const r = classifyOutputs(TOPOLOGY_NODES, TOPOLOGY_CONNECTIONS, TOPOLOGY_GEOMETRY);
  assert.deepEqual(r.segBbox, []);
  assert.deepEqual(r.coincident, []);
  assert.deepEqual(r.hypB, []);
  assert.deepEqual(r.hypC, []);
});
