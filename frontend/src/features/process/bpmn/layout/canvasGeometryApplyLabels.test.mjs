// canvasGeometryApplyLabels.test.mjs — подписи следуют за владельцем при apply
// геометрии (контур fix/canvas-geometry-labels-follow).
//
// Инварианты:
//   - label связи при трансляции получает ТУ ЖЕ {dx,dy}, что waypoints;
//   - label связи при переразводке пересаживается на середину самого длинного
//     сегмента нового маршрута (детерминированно: при равенстве длин побеждает
//     первый строго самый длинный сегмент — tie-break зафиксирован здесь же);
//   - label элемента (external label) сдвигается вместе с узлом;
//   - узлы/связи без label и недвинутые узлы в label-maps не попадают.
import test from "node:test";
import assert from "node:assert/strict";

import {
  computeGeometryApplyPlan,
  computeLabelPlacementOnRoute,
} from "./canvasGeometryApply.js";

test("computeLabelPlacementOnRoute: середина самого длинного сегмента", () => {
  assert.deepEqual(
    computeLabelPlacementOnRoute([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]),
    { x: 50, y: 0 },
  );
});

test("computeLabelPlacementOnRoute: tie-break — первый из равных (детерминизм)", () => {
  // Оба сегмента длиной 50: побеждает ПЕРВЫЙ (сравнение строго `>`, не `>=`).
  assert.deepEqual(
    computeLabelPlacementOnRoute([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }]),
    { x: 25, y: 0 },
  );
});

test("computeLabelPlacementOnRoute: маршрут из двух точек / null на <2 точек", () => {
  assert.deepEqual(
    computeLabelPlacementOnRoute([{ x: 10, y: 20 }, { x: 110, y: 20 }]),
    { x: 60, y: 20 },
  );
  assert.equal(computeLabelPlacementOnRoute([{ x: 10, y: 20 }]), null);
  assert.equal(computeLabelPlacementOnRoute([]), null);
  assert.equal(computeLabelPlacementOnRoute(null), null);
});

// Синтетическая схема: A → B → C(шлюз вниз). sequenceGap 250 при текущем
// зазоре 200 сдвинет B на 50; C наследует сдвиг B (downstream).
// f1 (A→B): дельты концов разные → reroute; f2 (B→C): общая дельта → translate.
const NODES = [
  { id: "A", type: "task", x: 0, y: 0, width: 100, height: 80 },
  {
    id: "B", type: "task", x: 300, y: 0, width: 100, height: 80,
    label: { x: 310, y: 90, width: 60, height: 14 },
  },
  {
    id: "C", type: "exclusiveGateway", x: 325, y: 300, width: 50, height: 50,
    label: { x: 320, y: 360, width: 60, height: 27 },
  },
];
const CONNECTIONS = [
  {
    id: "f1", sourceId: "A", targetId: "B",
    waypoints: [{ x: 100, y: 40 }, { x: 300, y: 40 }],
    label: { x: 180, y: 26, width: 40, height: 14 },
  },
  {
    id: "f2", sourceId: "B", targetId: "C",
    waypoints: [{ x: 350, y: 80 }, { x: 350, y: 300 }],
    label: { x: 356, y: 180, width: 40, height: 14 },
  },
];
const GEOMETRY = { taskWidth: 100, taskHeight: 80, sequenceGap: 250 };

test("plan: label связи следует за владельцем (translate — та же дельта, reroute — пересадка)", () => {
  const plan = computeGeometryApplyPlan(
    { nodes: NODES, connections: CONNECTIONS },
    GEOMETRY,
  );

  // Схема-инвариант: f1 переразводится, f2 транслируется (иначе сценарий бессмыслен).
  assert.ok(plan.connectionWaypoints.has("f1"), "f1 — reroute");
  assert.ok(plan.connectionTranslations.has("f2"), "f2 — translate");
  assert.deepEqual(plan.connectionTranslations.get("f2"), { dx: 50, dy: 0 });

  // Translate: label получает ту же дельту, что waypoints связи.
  assert.deepEqual(plan.connectionLabelDeltas.get("f2"), { dx: 50, dy: 0 });
  assert.ok(!plan.connectionLabelPlacements.has("f2"), "translate не даёт placement");

  // Reroute: label пересажен на середину самого длинного сегмента нового маршрута.
  const placement = plan.connectionLabelPlacements.get("f1");
  assert.ok(placement, "reroute даёт placement");
  assert.deepEqual(placement, computeLabelPlacementOnRoute(plan.connectionWaypoints.get("f1")));
  assert.ok(!plan.connectionLabelDeltas.has("f1"), "reroute не даёт delta");

  // Label элемента: сдвиг вместе с узлом.
  assert.deepEqual(plan.shapeLabelDeltas.get("B"), { dx: 50, dy: 0 });
  assert.deepEqual(plan.shapeLabelDeltas.get("C"), { dx: 50, dy: 0 });
  assert.ok(!plan.shapeLabelDeltas.has("A"), "недвинутый узел без дельты");

  // Связь без label не попадает в label-maps.
  const connsNoLabel = [{ ...CONNECTIONS[0], id: "f3", label: undefined }];
  const plan2 = computeGeometryApplyPlan({ nodes: NODES, connections: connsNoLabel }, GEOMETRY);
  assert.ok(!plan2.connectionLabelPlacements.has("f3"));
  assert.ok(!plan2.connectionLabelDeltas.has("f3"));
});
