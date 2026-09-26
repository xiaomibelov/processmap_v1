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
import {
  connectionLabels,
  nodeLabels,
} from "./__fixtures__/geometryApplyRealLagmanLabels.mjs";
import {
  computeGeometryApplyPlan,
  computeLabelPlacementOnRoute,
} from "./canvasGeometryApply.js";
import {
  computeExitCorridor,
  findChannelConflicts,
  validateConnectionGeometry,
} from "./canvasGeometryRouting.js";

const GEOMS = {
  default: { taskWidth: 130, taskHeight: 80, sequenceGap: 100 },
  admin: { taskWidth: 170, taskHeight: 100, sequenceGap: 120 },
};

// Подписи следуют за владельцем (контур fix/canvas-geometry-labels-follow):
// вход плана обогащается реальными di.label.bounds из golden-фикстуры «Лагман».
const withLabels = (nodesIn, connectionsIn) => ({
  nodes: nodesIn.map((n) => (nodeLabels[n.id] ? { ...n, label: nodeLabels[n.id] } : n)),
  connections: connectionsIn.map((c) =>
    connectionLabels[c.id] ? { ...c, label: connectionLabels[c.id] } : c),
});

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

// --- Подписи следуют за владельцем (real-фикстура «Лагман») ---
//
// Инварианты (assert по дельтам, обе геометрии):
//   - у каждого узла с label из фикстуры, попавшего в positions, дельта label
//     равна дельте позиции узла (сдвиг вместе с узлом, fail-visible покрытие);
//   - label транслированной связи получает ровно ту же {dx,dy}, что waypoints;
//   - label переразведённой связи пересажен на середину самого длинного
//     сегмента нового маршрута (детерминированный placement);
//   - обратное покрытие: нет label-maps для связей/узлов вне changed-множества.
for (const [name, geometry] of Object.entries(GEOMS)) {
  test(`Лагман (${name}): di.label.bounds согласованы с владельцем`, () => {
    const plan = computeGeometryApplyPlan(withLabels(nodes, connections), geometry);

    // 1. Shape labels: дельта label == дельта позиции узла (двусторонне, fail-visible).
    for (const [id, delta] of plan.shapeLabelDeltas) {
      const node = nodes.find((n) => n.id === id);
      const pos = plan.positions.get(id);
      assert.ok(nodeLabels[id], `label узла ${id} есть в фикстуре`);
      assert.ok(pos, `узел ${id} с label двигается`);
      assert.deepEqual(delta, { dx: pos.x - node.x, dy: pos.y - node.y },
        `label-операция узла ${id} == дельта позиции`);
    }
    for (const n of nodes) {
      if (!nodeLabels[n.id] || !plan.positions.has(n.id)) continue;
      assert.ok(plan.shapeLabelDeltas.has(n.id),
        `у движущегося узла ${n.id} с label есть label-операция`);
    }

    // 2. Translated: label == та же дельта; обратное покрытие по label-bearing связям.
    for (const [id, d] of plan.connectionLabelDeltas) {
      assert.ok(connectionLabels[id], `label связи ${id} есть в фикстуре`);
      assert.deepEqual(d, plan.connectionTranslations.get(id),
        `label связи ${id} транслируется как waypoints`);
    }
    for (const c of connections) {
      if (!connectionLabels[c.id] || !plan.connectionTranslations.has(c.id)) continue;
      assert.ok(plan.connectionLabelDeltas.has(c.id),
        `у транслированной связи ${c.id} с label есть label-операция`);
    }

    // 3. Rerouted: placement == середина самого длинного сегмента нового маршрута.
    for (const [id, center] of plan.connectionLabelPlacements) {
      const pts = plan.connectionWaypoints.get(id);
      assert.ok(connectionLabels[id], `label связи ${id} есть в фикстуре`);
      assert.ok(pts, `связь ${id} переразведена`);
      assert.deepEqual(center, computeLabelPlacementOnRoute(pts),
        `label связи ${id} пересажен на маршрут`);
    }
    for (const c of connections) {
      if (!connectionLabels[c.id] || !plan.connectionWaypoints.has(c.id)) continue;
      assert.ok(plan.connectionLabelPlacements.has(c.id),
        `у переразведённой связи ${c.id} с label есть placement`);
    }

    // 4. Label-maps не выходят за changed-множество (нет висячих операций).
    for (const id of plan.connectionLabelDeltas.keys()) {
      assert.ok(plan.connectionTranslations.has(id), `delta ${id} ⊂ changed`);
    }
    for (const id of plan.connectionLabelPlacements.keys()) {
      assert.ok(plan.connectionWaypoints.has(id), `placement ${id} ⊂ changed`);
    }
    for (const id of plan.shapeLabelDeltas.keys()) {
      assert.ok(plan.positions.has(id), `shapeLabel ${id} ⊂ positions`);
    }
  });
}
