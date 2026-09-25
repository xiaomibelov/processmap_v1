import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  computeGeometryApplyPlan,
  computeTaskResizePlan,
  isResizableTaskType,
  sanitizeCanvasGeometry,
} from "./canvasGeometryApply.js";
import { CANON_GEOMETRY_DEFAULTS } from "./canvasGeometry.js";

const HERE = dirname(fileURLToPath(import.meta.url));

function task(id, x, y, width = 120, height = 70, extra = {}) {
  return { id, type: "bpmn:Task", x, y, width, height, ...extra };
}

// --- sanitizeCanvasGeometry ---

test("sanitize: валидные значения проходят", () => {
  assert.deepEqual(sanitizeCanvasGeometry({ taskWidth: 200, taskHeight: 120, sequenceGap: 250 }), {
    taskWidth: 200, taskHeight: 120, sequenceGap: 250,
  });
});

test("sanitize: битые/вне границ → дефолт канона по полям", () => {
  assert.deepEqual(sanitizeCanvasGeometry(null), CANON_GEOMETRY_DEFAULTS);
  assert.deepEqual(sanitizeCanvasGeometry({}), CANON_GEOMETRY_DEFAULTS);
  assert.deepEqual(
    sanitizeCanvasGeometry({ taskWidth: "abc", taskHeight: 10, sequenceGap: 9999 }),
    CANON_GEOMETRY_DEFAULTS,
    "каждое битое поле → свой дефолт, валидные соседние не ломаются"
  );
  assert.deepEqual(
    sanitizeCanvasGeometry({ taskWidth: 200, taskHeight: 10, sequenceGap: 250 }),
    { taskWidth: 200, taskHeight: CANON_GEOMETRY_DEFAULTS.taskHeight, sequenceGap: 250 }
  );
});

// --- isResizableTaskType ---

test("isResizableTaskType: Task и подтипы да, остальное нет", () => {
  for (const t of ["bpmn:Task", "bpmn:UserTask", "bpmn:ServiceTask", "bpmn:ScriptTask",
    "bpmn:SendTask", "bpmn:ReceiveTask", "bpmn:ManualTask", "bpmn:BusinessRuleTask"]) {
    assert.ok(isResizableTaskType(t), t);
  }
  for (const t of ["bpmn:SubProcess", "bpmn:CallActivity", "bpmn:StartEvent",
    "bpmn:BoundaryEvent", "bpmn:ExclusiveGateway", "bpmn:SequenceFlow", null, 42]) {
    assert.ok(!isResizableTaskType(t), String(t));
  }
});

// --- computeTaskResizePlan ---

test("ресайз: якорь — центр фигуры", () => {
  const plan = computeTaskResizePlan([task("t1", 100, 100, 120, 70)], { taskWidth: 200, taskHeight: 120, sequenceGap: 100 });
  // центр было (160,135) → остаётся
  assert.deepEqual(plan.get("t1"), { x: 60, y: 75, width: 200, height: 120 });
});

test("ресайз: все подтипы покрыты, не-таски и NaN-геометрия пропускаются", () => {
  const nodes = [
    { id: "u", type: "bpmn:UserTask", x: 0, y: 0, width: 100, height: 60 },
    { id: "sub", type: "bpmn:SubProcess", x: 0, y: 0, width: 300, height: 200 },
    { id: "gw", type: "bpmn:ExclusiveGateway", x: 0, y: 0, width: 40, height: 40 },
    { id: "bad", type: "bpmn:Task", x: NaN, y: 0, width: 100, height: 60 },
    { id: "bad2", type: "bpmn:Task", x: 0, y: 0, width: "x", height: 60 },
  ];
  const plan = computeTaskResizePlan(nodes, { taskWidth: 200, taskHeight: 120, sequenceGap: 100 });
  assert.equal(plan.size, 1);
  assert.ok(plan.has("u"));
});

// --- computeGeometryApplyPlan ---

// ПРИЧИНА ПЕРЕЗАПИСИ: глобальная перекладка рядов (computeLaneRowAlignPlan)
// удалена контуром fix/canvas-geometry-apply-topology — она схлопывала длинные
// цепочки к левому краю, затирала y медианой ряда и поглощала вертикальные
// ветки. Новая семантика: центр-якорный ресайз тасок + локальная нормализация
// зазоров вдоль flow-рёбер; y (точнее centerY) узлов неизменны.

test("композиция: цепочка тасков → размеры из настроек, зазор = sequenceGap, centerY сохранён", () => {
  const nodes = [
    task("t1", 100, 100, 120, 70),
    task("t2", 400, 110, 120, 70),
    task("t3", 700, 105, 120, 70),
  ];
  const connections = [
    { id: "c12", sourceId: "t1", targetId: "t2", waypoints: [{ x: 220, y: 135 }, { x: 400, y: 145 }] },
    { id: "c23", sourceId: "t2", targetId: "t3", waypoints: [{ x: 520, y: 145 }, { x: 700, y: 140 }] },
  ];
  const g = { taskWidth: 200, taskHeight: 120, sequenceGap: 250 };
  const { positions, stats } = computeGeometryApplyPlan({ nodes, connections }, g);
  for (const id of ["t1", "t2", "t3"]) {
    assert.equal(positions.get(id).width, 200, `${id} width`);
    assert.equal(positions.get(id).height, 120, `${id} height`);
  }
  const gap1 = positions.get("t2").x - (positions.get("t1").x + 200);
  const gap2 = positions.get("t3").x - (positions.get("t2").x + 200);
  assert.equal(gap1, 250, "зазор 250");
  assert.equal(gap2, 250, "зазор 250");
  // centerY сохраняются (центр-якорь), y не выравниваются по медиане ряда
  assert.equal(positions.get("t1").y + 60, 135, "t1 centerY");
  assert.equal(positions.get("t2").y + 60, 145, "t2 centerY");
  assert.equal(positions.get("t3").y + 60, 140, "t3 centerY");
  assert.equal(stats.tasksResized, 3);
  assert.equal(stats.nodesShifted, 2, "t2 и t3 сдвинуты каскадом");
});

test("композиция: одиночная таска вне ряда → только ресайз, центр сохранён", () => {
  const nodes = [task("solo", 333, 777, 120, 70, { laneKey: "l" })];
  const g = { taskWidth: 200, taskHeight: 120, sequenceGap: 250 };
  const { positions, connectionTranslations, stats } = computeGeometryApplyPlan({ nodes, connections: [] }, g);
  assert.deepEqual(positions.get("solo"), { x: 293, y: 752, width: 200, height: 120 });
  assert.equal(positions.get("solo").x + 100, 333 + 60, "центр X сохранён");
  assert.equal(positions.get("solo").y + 60, 777 + 35, "центр Y сохранён");
  assert.equal(connectionTranslations.size, 0);
  assert.equal(stats.tasksResized, 1);
  assert.equal(stats.nodesShifted, 0, "одиночная таска без рёбер не сдвигается");
});

// ПРИЧИНА ПЕРЕЗАПИСИ (fix/canvas-geometry-apply-topology): трансляция на дельту
// одного конца при разных дельтах заменена переразводкой waypoints; translation
// — только когда оба конца на одной дельте.
test("стрелки: оба конца на одной дельте → чистая translation {dx,dy}", () => {
  // s толкает a (горизонтальное ребро с дефицитом зазора), b — вертикальная
  // ветка от a: оба наследуют один и тот же сдвиг → ребро a→b транслируется.
  const nodes = [
    task("s", -300, 100, 130, 80),
    task("a", 100, 100, 130, 80),
    task("b", 100, 400, 130, 80),
  ];
  const connections = [
    { id: "csa", sourceId: "s", targetId: "a", waypoints: [{ x: -170, y: 140 }, { x: 100, y: 140 }] },
    { id: "cab", sourceId: "a", targetId: "b", waypoints: [{ x: 165, y: 180 }, { x: 165, y: 400 }] },
  ];
  const { positions, connectionTranslations, connectionWaypoints } = computeGeometryApplyPlan({ nodes, connections }, {
    taskWidth: 130, taskHeight: 80, sequenceGap: 400,
  });
  const shiftA = positions.get("a").x - 100;
  assert.ok(shiftA > 0, "a сдвинута дефицитом зазора");
  const tr = connectionTranslations.get("cab");
  assert.ok(tr, "translation for cab");
  assert.equal(tr.dx, shiftA, "оба конца на дельте a");
  assert.equal(tr.dy, 0, "dy всегда 0");
  assert.equal(connectionWaypoints.has("cab"), false, "общая дельта — без reroute");
});

test("стрелки к таске, у которой только ресайз (центр не сдвинут), не трогаются", () => {
  const nodes = [
    task("solo", 100, 100, 130, 80, { laneKey: "l" }),
    // событие в другом ряду (centerY 430 vs 130) — align-ряда не образует
    { id: "e", type: "bpmn:EndEvent", x: 400, y: 412, width: 36, height: 36, laneKey: "l" },
  ];
  const connections = [{
    id: "c1", sourceId: "solo", targetId: "e",
    waypoints: [{ x: 230, y: 140 }, { x: 400, y: 140 }],
  }];
  // solo — только ресайз с тем же центром, e — одиночное событие вне ряда
  const { connectionTranslations, positions } = computeGeometryApplyPlan({ nodes, connections }, {
    taskWidth: 200, taskHeight: 120, sequenceGap: 100,
  });
  assert.ok(positions.has("solo"), "solo resized");
  assert.equal(positions.has("e"), false, "событие вне ряда не трогаем");
  assert.equal(connectionTranslations.size, 0, "waypoints без изменений");
});

// ПРИЧИНА ПЕРЕЗАПИСИ (fix/canvas-geometry-apply-topology): события и шлюзы
// больше не пересаживаются на канон-размеры и не перекладываются по рядам —
// настройки геометрии их не касаются, сдвигаются только по x вместе с потоком.
test("события/шлюзы: настройки таски не касаются — не ресайзятся и не сдвигаются без потока", () => {
  const nodes = [
    { id: "e1", type: "bpmn:StartEvent", x: 100, y: 100, width: 36, height: 36, laneKey: "l" },
    { id: "e2", type: "bpmn:EndEvent", x: 300, y: 100, width: 36, height: 36, laneKey: "l" },
  ];
  const { positions } = computeGeometryApplyPlan({ nodes, connections: [] }, {
    taskWidth: 400, taskHeight: 400, sequenceGap: 20,
  });
  assert.equal(positions.has("e1"), false, "событие без сдвига не трогаем");
  assert.equal(positions.has("e2"), false, "событие без сдвига не трогаем");
});

test("граничные: пустая схема → noop, схема без тасков → noop", () => {
  for (const input of [{ nodes: [], connections: [] }, { nodes: null, connections: null }, {}]) {
    const plan = computeGeometryApplyPlan(input, { taskWidth: 200, taskHeight: 120, sequenceGap: 250 });
    assert.equal(plan.noop, true, JSON.stringify(input));
    assert.equal(plan.positions.size, 0);
    assert.equal(plan.connectionTranslations.size, 0);
  }
  const noTasks = computeGeometryApplyPlan({
    nodes: [
      { id: "sub", type: "bpmn:SubProcess", x: 0, y: 0, width: 300, height: 200 },
      { id: "e", type: "bpmn:StartEvent", x: 50, y: 50, width: 36, height: 36 },
    ],
    connections: [],
  }, { taskWidth: 200, taskHeight: 120, sequenceGap: 250 });
  assert.equal(noTasks.noop, true, "без тасков — нечего ресайзить, align-рядов нет");
});

test("граничные: невалидные настройки → дефолты канона, зазор = дефолт канона", () => {
  const nodes = [
    task("t1", 100, 100, 120, 70),
    task("t2", 280, 100, 120, 70),
  ];
  const connections = [
    { id: "c12", sourceId: "t1", targetId: "t2", waypoints: [{ x: 220, y: 135 }, { x: 280, y: 135 }] },
  ];
  const { positions } = computeGeometryApplyPlan({ nodes, connections }, {
    taskWidth: "junk", taskHeight: -5, sequenceGap: 99999,
  });
  assert.equal(positions.get("t1").width, CANON_GEOMETRY_DEFAULTS.taskWidth);
  assert.equal(positions.get("t1").height, CANON_GEOMETRY_DEFAULTS.taskHeight);
  const d = positions.get("t2").x - (positions.get("t1").x + positions.get("t1").width);
  assert.equal(d, CANON_GEOMETRY_DEFAULTS.sequenceGap, "зазор = дефолт канона");
});

// --- gate: один undo-шаг через хендлер align-паттерна ---

// Минимальный стенд: реплицирует контракт FpcAlignDiagramHandler
// (BpmnStage.jsx) — records на execute, восстановление на revert.
// DI мутируется только через el.di / conn.di (gate DI ниже).
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
          di: diBounds ? { x: diBounds.x, y: diBounds.y, width: diBounds.width, height: diBounds.height } : null,
        });
        el.x = op.x; el.y = op.y; el.width = op.width; el.height = op.height;
        if (diBounds) {
          diBounds.x = op.x; diBounds.y = op.y; diBounds.width = op.width; diBounds.height = op.height;
        }
      }
      for (const op of context.connectionOps || []) {
        const conn = op.element;
        const diW = conn.di && Array.isArray(conn.di.waypoint) ? conn.di.waypoint : null;
        context.records.push({
          kind: "connection", el: conn,
          waypoints: conn.waypoints.map((p) => ({ x: p.x, y: p.y })),
          diWaypoints: diW ? diW.map((p) => ({ x: p.x, y: p.y })) : null,
        });
        for (const p of conn.waypoints) { p.x += op.dx; p.y += op.dy; }
        if (diW) for (const p of diW) { p.x += op.dx; p.y += op.dy; }
      }
    },
    revert(context) {
      for (const rec of context.records || []) {
        if (rec.kind === "shape") {
          rec.el.x = rec.x; rec.el.y = rec.y; rec.el.width = rec.width; rec.el.height = rec.height;
          if (rec.di && rec.el.di && rec.el.di.bounds) {
            const b = rec.el.di.bounds;
            b.x = rec.di.x; b.y = rec.di.y; b.width = rec.di.width; b.height = rec.di.height;
          }
        } else {
          rec.el.waypoints.forEach((p, i) => { p.x = rec.waypoints[i].x; p.y = rec.waypoints[i].y; });
          if (rec.diWaypoints && rec.el.di && Array.isArray(rec.el.di.waypoint)) {
            rec.el.di.waypoint.forEach((p, i) => { p.x = rec.diWaypoints[i].x; p.y = rec.diWaypoints[i].y; });
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
  return { commandStack, handler };
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

test("gate: один commandStack.execute на операцию; undo возвращает геометрию и DI исходной", () => {
  const els = [
    { id: "t1", type: "bpmn:Task", x: 103, y: 100, width: 130, height: 80, laneKey: "l", di: { bounds: { x: 103, y: 100, width: 130, height: 80 } } },
    { id: "t2", type: "bpmn:Task", x: 333, y: 100, width: 130, height: 80, laneKey: "l", di: { bounds: { x: 333, y: 100, width: 130, height: 80 } } },
  ];
  const conn = { id: "c1", sourceId: "t1", targetId: "t2", waypoints: [{ x: 233, y: 140 }, { x: 333, y: 140 }], di: { waypoint: [{ x: 233, y: 140 }, { x: 333, y: 140 }] } };
  const before = snapshotEls([...els, conn]);

  const { positions, connectionTranslations } = computeGeometryApplyPlan({
    nodes: els, connections: [{ id: conn.id, sourceId: "t1", targetId: "t2", waypoints: conn.waypoints }],
  }, { taskWidth: 200, taskHeight: 120, sequenceGap: 250 });

  const { commandStack } = makeHandlerStand();
  commandStack.registerHandler("fpc.applyGeometry", {});
  const shapeOps = [];
  for (const [id, pos] of positions) {
    const el = els.find((e) => e.id === id);
    shapeOps.push({ element: el, ...pos });
  }
  const connectionOps = [];
  for (const [id, tr] of connectionTranslations) {
    if (!tr.dx && !tr.dy) continue;
    connectionOps.push({ element: conn, dx: tr.dx, dy: tr.dy });
  }
  assert.ok(shapeOps.length > 0);
  commandStack.execute("fpc.applyGeometry", { shapeOps, connectionOps });
  assert.equal(commandStack.executeCount, 1, "ровно один undo-шаг");

  commandStack.undo();
  const after = snapshotEls([...els, conn]);
  assert.deepEqual(after, before, "после undo схема идентична исходной (вкл. DI)");
});

test("gate: no-op — ни одного execute (пустой undo-шаг запрещён)", () => {
  const { commandStack } = makeHandlerStand();
  for (const input of [
    { nodes: [], connections: [] },
    {
      nodes: [{ id: "sub", type: "bpmn:SubProcess", x: 0, y: 0, width: 300, height: 200 }],
      connections: [],
    },
  ]) {
    const plan = computeGeometryApplyPlan(input, { taskWidth: 200, taskHeight: 120, sequenceGap: 250 });
    assert.equal(plan.noop, true);
    if (!plan.noop) commandStack.execute("fpc.applyGeometry", { shapeOps: [], connectionOps: [] });
  }
  assert.equal(commandStack.executeCount, 0);
});

// --- gate: DI только через el.di / conn.di; направление импортов ---

test("gate: в коде применения DI доступен только через el.di/conn.di", () => {
  const files = ["canvasGeometryApply.js", "canvasGeometry.js", "laneRowAlign.js"];
  for (const f of files) {
    const src = readFileSync(join(HERE, f), "utf8");
    assert.ok(!src.includes("businessObject.di"), `${f}: businessObject.di запрещён`);
  }
  const bpmnStage = readFileSync(join(HERE, "..", "..", "..", "..", "components", "process", "BpmnStage.jsx"), "utf8");
  const applyRegion = bpmnStage.slice(bpmnStage.indexOf("applyGeometryOnInstance") - 4000, bpmnStage.indexOf("applyGeometryOnInstance") + 6000);
  assert.ok(!applyRegion.includes("businessObject.di"), "BpmnStage: регион applyGeometry без businessObject.di");
});

test("gate: направление зависимостей — apply не зависит от laneRowAlign (глобальная перекладка рядов удалена)", () => {
  for (const f of ["laneRowAlign.js", "canvasGeometry.js"]) {
    const src = readFileSync(join(HERE, f), "utf8");
    assert.ok(!src.includes("canvasGeometryApply"), `${f} не зависит от apply-модуля`);
  }
  const applySrc = readFileSync(join(HERE, "canvasGeometryApply.js"), "utf8");
  assert.ok(applySrc.includes('from "./canvasGeometry.js"'), "apply → canvasGeometry");
  // ПРИЧИНА (fix/canvas-geometry-apply-topology): computeLaneRowAlignPlan
  // удалён из apply — перекладка рядов ломала длинные цепочки; регресс align = 0.
  assert.ok(!applySrc.includes("laneRowAlign"), "apply не импортирует laneRowAlign");
});
