// canvasGeometryApply.js — применение настроек геометрии канваса к схеме
// (контур feature/canvas-geometry-apply, шаг 2).
//
// Чистые функции без bpmn-js-вайринга (тестируемы через node --test).
// Зависимости направлены строго в одну сторону:
//   canvasGeometryApply → canvasGeometry → laneRowAlign (циклов нет).
//
// Состав операции «Применить к схеме»:
// 1. Ресайз ВСЕХ тасков (bpmn:Task и подтипы, /Task$/) до настроенного
//    taskWidth × taskHeight, якорь — центр фигуры (канон-ресайз align).
// 2. Ряды нод (инфраструктура computeLaneRowAlignPlan) раскладываются
//    кастомной геометрией: размер таски из настроек, зазор = sequenceGap.
//    События и шлюзы остаются на канон-размерах (настройки их не касаются).
// 3. Стрелки — только трансляция waypoints по дельтам концов (правила align).
// Ноды вне рядов: только ресайз (дельта позиции 0 → стрелки не трогаем).

import {
  CANON_NODE_SIZES,
  computeLaneRowAlignPlan,
} from "./laneRowAlign.js";
import {
  CANON_GEOMETRY_DEFAULTS,
  CANVAS_GEOMETRY_BOUNDS,
} from "./canvasGeometry.js";

function coerceInt(value) {
  if (typeof value === "boolean" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

function pickWithinBounds(value, bounds, fallback) {
  if (value === null) return fallback;
  if (value < bounds.min || value > bounds.max) return fallback;
  return value;
}

// Любая битость поля → дефолт канона этого поля (дублирует семантику
// parseCanvasGeometry, но для camelCase-входа; getter getCanvasGeometry()
// отдаёт уже валидное — это защита вглубь для прямых вызовов/тестов).
export function sanitizeCanvasGeometry(geometry) {
  const src = geometry && typeof geometry === "object" ? geometry : {};
  return {
    taskWidth: pickWithinBounds(
      coerceInt(src.taskWidth),
      CANVAS_GEOMETRY_BOUNDS.taskWidth,
      CANON_GEOMETRY_DEFAULTS.taskWidth
    ),
    taskHeight: pickWithinBounds(
      coerceInt(src.taskHeight),
      CANVAS_GEOMETRY_BOUNDS.taskHeight,
      CANON_GEOMETRY_DEFAULTS.taskHeight
    ),
    sequenceGap: pickWithinBounds(
      coerceInt(src.sequenceGap),
      CANVAS_GEOMETRY_BOUNDS.sequenceGap,
      CANON_GEOMETRY_DEFAULTS.sequenceGap
    ),
  };
}

// bpmn:Task и подтипы (UserTask, ServiceTask, ScriptTask, SendTask,
// ReceiveTask, ManualTask, BusinessRuleTask). BoundaryEvent заканчивается
// на "Event" — сюда не попадает. SubProcess/CallActivity — не таски.
export function isResizableTaskType(type) {
  return typeof type === "string" && /Task$/.test(type);
}

/**
 * Фаза 1: ресайз всех тасков, якорь — центр фигуры.
 * @returns {Map<string,{x,y,width,height}>}
 */
export function computeTaskResizePlan(nodes, geometry) {
  const g = sanitizeCanvasGeometry(geometry);
  const plan = new Map();
  for (const node of nodes || []) {
    if (!node || !node.id) continue;
    if (!isResizableTaskType(node.type)) continue;
    const x = Number(node.x);
    const y = Number(node.y);
    const width = Number(node.width);
    const height = Number(node.height);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!Number.isFinite(width) || !Number.isFinite(height)) continue;
    const cx = x + width / 2;
    const cy = y + height / 2;
    plan.set(node.id, {
      x: cx - g.taskWidth / 2,
      y: cy - g.taskHeight / 2,
      width: g.taskWidth,
      height: g.taskHeight,
    });
  }
  return plan;
}

/**
 * Полный план «Применить к схеме».
 * @param {{nodes: Array, connections: Array}} input формат как у computeLaneRowAlignPlan
 * @param {{taskWidth?,taskHeight?,sequenceGap?}} geometry сырые настройки
 * @returns {{
 *   positions: Map<string,{x,y,width,height}>,
 *   connectionTranslations: Map<string,{dx,dy}>,
 *   stats: {rowsAligned,nodesAligned,nodesSkipped,tasksResized},
 *   noop: boolean,
 * }}
 */
export function computeGeometryApplyPlan(input, geometry) {
  const g = sanitizeCanvasGeometry(geometry);
  const nodes = (input && input.nodes) || [];
  const connections = (input && input.connections) || [];

  // Фаза 1 — виртуальный ресайз (центры сохранены).
  const resizePlan = computeTaskResizePlan(nodes, g);
  const resizedNodes = nodes.map((node) =>
    node && resizePlan.has(node.id) ? { ...node, ...resizePlan.get(node.id) } : node
  );

  // Фаза 2 — ряды кастомной геометрией; события/шлюзы — канон.
  const nodeSizes = {
    ...CANON_NODE_SIZES,
    task: { width: g.taskWidth, height: g.taskHeight },
  };
  const align = computeLaneRowAlignPlan(
    { nodes: resizedNodes, connections },
    { nodeSizes, gap: g.sequenceGap }
  );

  // Композиция: позиция align побеждает (там и размер настройки);
  // таски вне рядов — только ресайз.
  const positions = new Map(align.positions);
  for (const [id, pos] of resizePlan) {
    if (!positions.has(id)) positions.set(id, pos);
  }

  const noop = positions.size === 0 && align.connectionTranslations.size === 0;
  return {
    positions,
    connectionTranslations: align.connectionTranslations,
    stats: { ...align.stats, tasksResized: resizePlan.size },
    noop,
  };
}
