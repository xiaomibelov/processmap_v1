// canvasGeometryApplyRealLagman.test.mjs — golden-метрики apply на реальной
// фикстуре «Лагман» (контур fix/canvas-geometry-routing-gateway-fan; фикстура
// подготовлена контуром fix/canvas-geometry-real-golden-fixture).
//
// Инварианты:
//   - connectionsChannelConflicts === 0 (STOP-DEFECT real-golden-контура:
//     fan-in/fan-out через одну сторону шлюза — исправлен anchor spreading);
//   - каждая изменённая связь проходит connectivity-gate (0 пересечений с
//     чужими bbox вне коридора выхода);
//   - connectionsSkipped fail-closed и не хуже исходного уровня (5/7 до фикса).
import test from "node:test";
import assert from "node:assert/strict";

import { nodes, connections } from "./__fixtures__/geometryApplyRealLagman.mjs";
import { computeGeometryApplyPlan } from "./canvasGeometryApply.js";
import {
  computeExitCorridor,
  findChannelConflicts,
  validateConnectionGeometry,
} from "./canvasGeometryRouting.js";

const GEOMS = {
  default: { taskWidth: 130, taskHeight: 80, sequenceGap: 100 },
  admin: { taskWidth: 170, taskHeight: 100, sequenceGap: 120 },
};

function changedConnectionInputs(plan) {
  const finalRects = new Map();
  for (const n of nodes) finalRects.set(n.id, { x: n.x, y: n.y, width: n.width, height: n.height });
  for (const [id, r] of plan.positions) finalRects.set(id, r);
  const attachedHost = new Map();
  for (const n of nodes) if (n.attachedTo) attachedHost.set(n.id, n.attachedTo);
  const out = [];
  for (const [id, pts] of plan.connectionWaypoints) {
    out.push({ id, pts, slack: 0, finalRects, attachedHost });
  }
  for (const [id, tr] of plan.connectionTranslations) {
    const conn = connections.find((c) => c.id === id);
    out.push({
      id,
      pts: conn.waypoints.map((p) => ({ x: p.x + tr.dx, y: p.y + tr.dy })),
      slack: 20,
      finalRects,
      attachedHost,
    });
  }
  return out;
}

for (const [name, geometry] of Object.entries(GEOMS)) {
  test(`Лагман (${name} ${geometry.taskWidth}x${geometry.taskHeight}/${geometry.sequenceGap}): 0 канал-конфликтов, все changed-связи валидны`, () => {
    const plan = computeGeometryApplyPlan({ nodes, connections }, geometry);
    assert.equal(plan.stats.connectionsChannelConflicts, 0, "канал-конфликтов 0");
    assert.equal(plan.noop, false);
    const changed = changedConnectionInputs(plan);
    assert.equal(
      changed.length,
      plan.stats.connectionsRerouted + plan.stats.connectionsTranslated,
      "каждая изменённая связь либо reroute, либо translate (fail-visible)",
    );
    for (const { id, pts, slack, finalRects, attachedHost } of changed) {
      const conn = connections.find((c) => c.id === id);
      const foreignRects = [];
      for (const [fid, r] of finalRects) {
        if (fid === conn.sourceId || fid === conn.targetId) continue;
        foreignRects.push({ id: fid, ...r });
      }
      const hostId = attachedHost.get(conn.sourceId);
      const hostExits = hostId
        ? [{ hostId, host: finalRects.get(hostId), corridor: computeExitCorridor(finalRects.get(hostId), pts[0]) }]
        : [];
      const v = validateConnectionGeometry({
        source: finalRects.get(conn.sourceId),
        target: finalRects.get(conn.targetId),
        waypoints: pts,
        foreignRects,
        hostExits,
        tolerance: 1,
        endSlack: slack,
      });
      assert.ok(v.ok, `связь ${id} валидна (${v.reason || "ok"})`);
    }
    // fail-closed: пропуски не хуже исходного уровня RED (default 5 / admin 7)
    const baseline = name === "default" ? 5 : 7;
    assert.ok(
      plan.stats.connectionsSkipped <= baseline,
      `connectionsSkipped ${plan.stats.connectionsSkipped} ≤ исходных ${baseline}`,
    );
    // Полный конфликт-учёт (rerouted + translated вместе): translated-связи
    // сохраняют исходную форму и пост-проходом не разводятся — на admin
    // остаётся 1 известная pre-existing пара (Flow_08z05be ∩ Flow_1p8pu5u,
    // зафиксирована ещё в RED real-golden-контура). Инвариант контура —
    // именно stats.connectionsChannelConflicts (rerouted) === 0.
    const allChanged = new Map(changed.map((c) => [c.id, c.pts]));
    const allBaseline = name === "admin" ? 1 : 0;
    assert.ok(
      findChannelConflicts(allChanged).length <= allBaseline,
      "полный учёт: только известные pre-existing translated-пары",
    );
  });
}
