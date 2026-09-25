// geometryApplyTopology.mjs — golden-фикстура контура fix/canvas-geometry-apply-topology.
//
// Синтетическая схема, воспроизводящая топологию баг-репорта v1.0.155
// (реальный sid недоступен в сессии — замена задокументирована в PLAN.md §1):
//   - 2 лайна;
//   - главная горизонтальная цепочка: start → T1..T10 → J (join, 2 входа: T10 и C2)
//     → end, таски 130×80, канон-зазор 100;
//   - 2 вертикальные ветки (B1→B2 под T3 с возвратом в T4; C1→C2 под T6
//     с входом в join-узел J), centerY веток далеко за пределами 40px от ряда;
//   - boundary event на T5 (BE1) с исходящей связью в T6;
//   - один изолированный таск D1 во втором лайне.
//
// Формат — вход computeGeometryApplyPlan: nodes (id/type/x/y/width/height/
// laneKey/laneBounds/attachedTo) + connections (id/sourceId/targetId/waypoints).
//
// Геометрия настроек для golden-теста: taskWidth 170, taskHeight 100,
// sequenceGap 120 (см. canvasGeometryApplyTopology.test.mjs).

export const TOPOLOGY_LANE_1 = { x: 40, y: 40, width: 3600, height: 800 };
export const TOPOLOGY_LANE_2 = { x: 40, y: 880, width: 3600, height: 300 };

const TASK_W = 130;
const TASK_H = 80;
const CHAIN_Y = 100;
const CHAIN_STEP = 230; // 130 ширина + 100 канон-зазор

function chainTask(i) {
  return {
    id: `T${i}`,
    type: "bpmn:Task",
    x: 100 + (i - 1) * CHAIN_STEP,
    y: CHAIN_Y,
    width: TASK_W,
    height: TASK_H,
    laneKey: "lane-1",
    laneBounds: TOPOLOGY_LANE_1,
  };
}

export const nodes = [
  { id: "start", type: "bpmn:StartEvent", x: 24, y: 122, width: 36, height: 36, laneKey: "lane-1", laneBounds: TOPOLOGY_LANE_1 },
  ...Array.from({ length: 10 }, (_, i) => chainTask(i + 1)),
  // join-узел с двумя входами (T10 и C2)
  { id: "J", type: "bpmn:Task", x: 2400, y: CHAIN_Y, width: TASK_W, height: TASK_H, laneKey: "lane-1", laneBounds: TOPOLOGY_LANE_1 },
  { id: "end", type: "bpmn:EndEvent", x: 2640, y: 122, width: 36, height: 36, laneKey: "lane-1", laneBounds: TOPOLOGY_LANE_1 },
  // ветка B: T3 → B1 → B2 → T4
  { id: "B1", type: "bpmn:Task", x: 330, y: 420, width: TASK_W, height: TASK_H, laneKey: "lane-1", laneBounds: TOPOLOGY_LANE_1 },
  { id: "B2", type: "bpmn:Task", x: 330, y: 680, width: TASK_W, height: TASK_H, laneKey: "lane-1", laneBounds: TOPOLOGY_LANE_1 },
  // ветка C: T6 → C1 → C2 → J
  { id: "C1", type: "bpmn:Task", x: 1470, y: 440, width: TASK_W, height: TASK_H, laneKey: "lane-1", laneBounds: TOPOLOGY_LANE_1 },
  { id: "C2", type: "bpmn:Task", x: 1470, y: 700, width: TASK_W, height: TASK_H, laneKey: "lane-1", laneBounds: TOPOLOGY_LANE_1 },
  // boundary event на T5
  { id: "BE1", type: "bpmn:BoundaryEvent", x: 1120, y: 162, width: 36, height: 36, laneKey: "lane-1", laneBounds: TOPOLOGY_LANE_1, attachedTo: "T5" },
  // изолированный таск во втором лайне
  { id: "D1", type: "bpmn:Task", x: 200, y: 960, width: TASK_W, height: TASK_H, laneKey: "lane-2", laneBounds: TOPOLOGY_LANE_2 },
];

function hConn(id, sourceId, targetId, x1, x2, y = 140) {
  return { id, sourceId, targetId, waypoints: [{ x: x1, y }, { x: x2, y }] };
}

export const connections = [
  hConn("c_start", "start", "T1", 60, 100),
  ...Array.from({ length: 9 }, (_, i) =>
    hConn(`c${i + 1}`, `T${i + 1}`, `T${i + 2}`, 100 + i * CHAIN_STEP + TASK_W, 100 + (i + 1) * CHAIN_STEP)
  ),
  hConn("c_T10_J", "T10", "J", 2300, 2400),
  hConn("c_J_end", "J", "end", 2530, 2640),
  { id: "c_T3_B1", sourceId: "T3", targetId: "B1", waypoints: [{ x: 625, y: 180 }, { x: 625, y: 420 }, { x: 395, y: 420 }] },
  { id: "c_B1_B2", sourceId: "B1", targetId: "B2", waypoints: [{ x: 395, y: 500 }, { x: 395, y: 680 }] },
  { id: "c_B2_T4", sourceId: "B2", targetId: "T4", waypoints: [{ x: 460, y: 720 }, { x: 790, y: 140 }] },
  { id: "c_T6_C1", sourceId: "T6", targetId: "C1", waypoints: [{ x: 1295, y: 180 }, { x: 1295, y: 440 }, { x: 1535, y: 440 }] },
  { id: "c_C1_C2", sourceId: "C1", targetId: "C2", waypoints: [{ x: 1535, y: 520 }, { x: 1535, y: 700 }] },
  { id: "c_C2_J", sourceId: "C2", targetId: "J", waypoints: [{ x: 1600, y: 740 }, { x: 2400, y: 140 }] },
  { id: "c_BE_T6", sourceId: "BE1", targetId: "T6", waypoints: [{ x: 1156, y: 180 }, { x: 1315, y: 180 }] },
];

// Геометрия настроек golden-теста (bounds-compliant).
export const TOPOLOGY_GEOMETRY = { taskWidth: 170, taskHeight: 100, sequenceGap: 120 };
