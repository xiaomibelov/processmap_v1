// geometryApplyStress.mjs — stress-фикстура контура fix/canvas-geometry-apply-routing.
//
// Синтетически воспроизводит ВСЕ классы баг-репорта постановки §2 (реальная
// схема недоступна — sid у владельца; замена задокументирована в PLAN.md §1):
//
//   Класс 1 (стрелка сквозь таск): цепочка P0→S→T, блокер M1 стоит точно
//     на оси S→T — manhattan-L v1.0.156 идёт прямо по его телу.
//   Класс 2 (совпадающие сегменты): fan-out J0→J1 и J0→J2 — обе связи
//     стартуют с одной точки привязки J0 и их горизонтальные сегменты
//     совпадают на участке 250..720 (y=430).
//   Класс 3 (деградированная связь): c_deg — одна точка (1600,700), оторванная
//     от обоих endpoint-фигур D1/D2; вход не трогается apply (нет дельт) —
//     гипотезы (b) «схлопывание» и (c) «endpoint оторван».
//   Класс 4 (safety-пропуски): не воспроизводится напрямую — узлы под
//     safety-пропуском получаются из геометрии, см. golden topology-фикстуру;
//     здесь stats.nodesSkipped ожидается 0.
//
// Геометрия настроек: taskWidth 170, taskHeight 100, sequenceGap 120
// (см. canvasGeometryApplyRouting.test.mjs).

export const STRESS_LANE = { x: 0, y: 0, width: 2600, height: 1100 };

function task(id, x, y) {
  return {
    id, type: "bpmn:Task", x, y, width: 130, height: 80,
    laneKey: "lane-s", laneBounds: STRESS_LANE,
  };
}

export const nodes = [
  // Класс 1: P0 толкает S (дефицит зазора), S→T reroute'ится сквозь M1.
  task("P0", -150, 100),
  task("S", 100, 100),
  task("M1", 500, 70),
  task("T", 900, 100),
  // Класс 2: fan-out J0→J1 / J0→J2 с совпадающими горизонтальными сегментами.
  // J1/J2 — join-узлы: их сдвигают вертикальные ветки X1→J1 / X2→J2 (через
  // пушеры P1→X1 / P2→X2), поэтому дельты концов разные → обе связи reroute'ятся.
  task("J0", 100, 400),
  task("J1", 700, 300),
  task("X1", 700, 800),
  task("P1", 450, 800),
  task("J2", 1000, 300),
  task("X2", 1000, 950),
  task("P2", 750, 950),
  // Класс 3: деградированная связь (одна оторванная точка).
  task("D1", 1400, 600),
  task("D2", 1720, 600),
];

export const connections = [
  { id: "c_p0_s", sourceId: "P0", targetId: "S", waypoints: [{ x: -20, y: 140 }, { x: 100, y: 140 }] },
  { id: "c_s_t", sourceId: "S", targetId: "T", waypoints: [{ x: 230, y: 140 }, { x: 900, y: 140 }] },
  { id: "c_p1_x1", sourceId: "P1", targetId: "X1", waypoints: [{ x: 580, y: 840 }, { x: 700, y: 840 }] },
  { id: "c_x1_j1", sourceId: "X1", targetId: "J1", waypoints: [{ x: 765, y: 800 }, { x: 765, y: 380 }] },
  { id: "c_j0_j1", sourceId: "J0", targetId: "J1", waypoints: [{ x: 230, y: 440 }, { x: 700, y: 340 }] },
  { id: "c_p2_x2", sourceId: "P2", targetId: "X2", waypoints: [{ x: 880, y: 990 }, { x: 1000, y: 990 }] },
  { id: "c_x2_j2", sourceId: "X2", targetId: "J2", waypoints: [{ x: 1065, y: 950 }, { x: 1065, y: 380 }] },
  { id: "c_j0_j2", sourceId: "J0", targetId: "J2", waypoints: [{ x: 230, y: 440 }, { x: 1000, y: 340 }] },
  // Деградированный вход: единственная waypoint оторвана от D1 и D2.
  { id: "c_deg", sourceId: "D1", targetId: "D2", waypoints: [{ x: 1600, y: 700 }] },
];

export const STRESS_GEOMETRY = { taskWidth: 170, taskHeight: 100, sequenceGap: 120 };
