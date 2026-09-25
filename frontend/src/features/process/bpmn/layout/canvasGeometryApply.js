// canvasGeometryApply.js — применение настроек геометрии канваса к схеме
// (контур feature/canvas-geometry-apply, шаг 2; фаза 2 переписана контуром
// fix/canvas-geometry-apply-topology).
//
// Чистые функции без bpmn-js-вайринга (тестируемы через node --test).
// Зависимости направлены строго в одну сторону: canvasGeometryApply →
// canvasGeometry (циклов нет; align-ряды больше не используются — глобальная
// перекладка рядов удалена, регресс align = 0, gate-тест следит за импортами).
//
// Состав операции «Применить к схеме» (постановка fix/canvas-geometry-apply-topology):
// 1. Ресайз ВСЕХ тасков (bpmn:Task и подтипы, /Task$/) до настроенного
//    taskWidth × taskHeight, якорь — центр фигуры (канон-ресайз align).
// 2. Локальная нормализация зазоров вдоль потока: обработка в порядке x
//    по возрастанию; по горизонтальному flow-ребру s→t
//    shift(t) ≥ shift(s) + max(0, sequenceGap − actualGap); по любому другому
//    flow-ребру shift(t) ≥ shift(s) (вертикальные ветки едут с родителем).
//    Никакой глобальной перекладки рядов, курсорного сжатия и затирания y:
//    y-координаты всех узлов не меняются никогда.
// 3. Безопасность: если сдвиг узла даёт пересечение bbox с узлом, не
//    являющимся его downstream и сдвинутым меньше него, — узел пропускается
//    (shift = 0, stats.nodesSkipped), каскад пересчитывается один раз.
// 4. Boundary events наследуют сдвиг хоста (attachedTo), не ресайзятся.
// 5. Стрелки: оба конца на одной дельте → чистая трансляция {dx,dy};
//    дельты разные / один конец → переразводка waypoints (manhattan L
//    между кропнутыми точками привязки пост-сдвига фигур), НЕ трансляция
//    на чужую дельту.

import {
  CANON_GEOMETRY_DEFAULTS,
  CANVAS_GEOMETRY_BOUNDS,
} from "./canvasGeometry.js";

// Ребро считается горизонтальным, только если цель начинается строго за
// правой гранью источника (по пост-ресайз геометрии) и стоит на той же
// горизонтали. Без проверки по dy вертикально стоящие ноды (target.cx ≥
// source.cx на равных x) получали бы «отрицательный зазор» и улетали вправо.
const HORIZONTAL_DY_TOLERANCE = 60;

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

function centerX(rect) { return rect.x + rect.width / 2; }
function centerY(rect) { return rect.y + rect.height / 2; }

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height;
}

// --- Фаза 2: локальная нормализация зазоров вдоль потока ---

function isHorizontalFlowEdge(source, target) {
  if (!source || !target) return false;
  if (centerX(target) < centerX(source)) return false;
  if (target.x < source.x + source.width) return false;
  return Math.abs(centerY(target) - centerY(source)) <= HORIZONTAL_DY_TOLERANCE;
}

// Проходы вычисления сдвигов до фикспоинта: рёбра в порядке x источника по
// возрастанию (циклы разрываются порядком x). Один проход недостаточен:
// рёбра внутри вертикальной ветки (источник на x основного ряда) обрабатываются
// до ребра «предок → вершина ветки» и не видят его сдвига. Сдвиги только
// растут и ограничены, фикспоинт сходится за 2-3 прохода.
// pinned — узлы, чей сдвиг принудительно 0 (safety-пропуск): на such узел
// НЕ ДОЛЖЕН давать вклад ни gap-инкремент, ни наследование (review B1) — ребро
// в pinned-цель пропускается целиком; pinned-источник транслирует 0.
function computeShifts(postRects, flowEdges, gap, pinned) {
  const shift = new Map();
  for (const [id] of postRects) shift.set(id, 0);
  const sorted = [...flowEdges].sort((a, b) =>
    centerX(postRects.get(a.sourceId)) - centerX(postRects.get(b.sourceId)));
  const maxPasses = Math.max(1, postRects.size);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (const edge of sorted) {
      if (pinned.has(edge.targetId)) continue; // review B1: pin побеждает наследование
      const s = postRects.get(edge.sourceId);
      const t = postRects.get(edge.targetId);
      if (!s || !t) continue;
      const shiftS = pinned.has(edge.sourceId) ? 0 : shift.get(edge.sourceId);
      let need = shiftS;
      if (isHorizontalFlowEdge(s, t)) {
        const actualGap = t.x - (s.x + s.width);
        need = shiftS + Math.max(0, gap - actualGap);
      }
      if (need > (shift.get(edge.targetId) || 0)) {
        shift.set(edge.targetId, need);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return shift;
}

// Достижимость по flow-рёбрам (для safety-проверки «w не downstream v»).
function isDownstream(flowEdges, fromId, toId) {
  const adj = new Map();
  for (const e of flowEdges) {
    if (!adj.has(e.sourceId)) adj.set(e.sourceId, []);
    adj.get(e.sourceId).push(e.targetId);
  }
  const seen = new Set([fromId]);
  const queue = [fromId];
  while (queue.length > 0) {
    const cur = queue.pop();
    if (cur === toId) return true;
    for (const next of adj.get(cur) || []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return false;
}

// Safety-verify (read-only): сдвинутый узел v, чей сдвиг даёт пересечение bbox
// с узлом w, который не является downstream v и сдвинут меньше v, — нарушитель.
function findSafetyViolators(postRects, flowEdges, shift, pinned) {
  const violators = new Set();
  const ordered = [...postRects.keys()].sort((a, b) =>
    centerX(postRects.get(a)) - centerX(postRects.get(b)) || a.localeCompare(b));
  for (const v of ordered) {
    if (pinned.has(v)) continue;
    const shiftV = shift.get(v) || 0;
    if (shiftV <= 0) continue;
    const rectV = postRects.get(v);
    const movedV = { ...rectV, x: rectV.x + shiftV };
    for (const w of ordered) {
      if (w === v) continue;
      const shiftW = shift.get(w) || 0;
      if (shiftW >= shiftV) continue;
      const rectW = postRects.get(w);
      const movedW = { ...rectW, x: rectW.x + shiftW };
      if (!rectsOverlap(movedV, movedW)) continue;
      if (isDownstream(flowEdges, v, w)) continue; // downstream разойдётся каскадом
      violators.add(v);
      break;
    }
  }
  return violators;
}

// --- Фаза 5: переразводка стрелок (manhattan L между кропнутыми точками) ---

function strictlyInside(p, r) {
  return p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
}

/**
 * Чистая manhattan-переразводка между двумя пост-сдвига прямоугольниками.
 * Сторона выхода — правая, если target справа, иначе нижняя/верхняя по dy;
 * сторона входа симметрична. Кроп от центра фигуры до границы (прямоугольник).
 * @returns {Array<{x:number,y:number}>} целые координаты, 2-3 точки.
 */
export function computeReroutedWaypoints(source, target) {
  const sCx = centerX(source);
  const sCy = centerY(source);
  const tCx = centerX(target);
  const tCy = centerY(target);
  const targetRight = tCx > sCx + 1;
  const targetBelow = tCy >= sCy;

  let out = targetRight
    ? { x: source.x + source.width, y: sCy }
    : targetBelow
      ? { x: sCx, y: source.y + source.height }
      : { x: sCx, y: source.y };
  let inp = targetRight
    ? { x: target.x, y: tCy }
    : targetBelow
      ? { x: tCx, y: target.y }
      : { x: tCx, y: target.y + target.height };

  // Гард (review m1): при перекрытии по x выбранная точка может лежать строго
  // внутри чужого bbox (s 100..270, t 200..560) — тогда L-маршрут идёт через
  // тело фигуры. Переносим точку на торец, свободный от чужой фигуры.
  if (strictlyInside(out, target)) {
    out = targetBelow
      ? { x: sCx, y: source.y + source.height }
      : { x: sCx, y: source.y };
    if (strictlyInside(out, target)) {
      out = targetBelow ? { x: sCx, y: source.y } : { x: sCx, y: source.y + source.height };
    }
  }
  if (strictlyInside(inp, source)) {
    inp = targetBelow
      ? { x: tCx, y: target.y }
      : { x: tCx, y: target.y + target.height };
    if (strictlyInside(inp, source)) {
      inp = targetBelow ? { x: tCx, y: target.y + target.height } : { x: tCx, y: target.y };
    }
  }

  const pts = [{ x: Math.round(out.x), y: Math.round(out.y) }];
  let mid = { x: Math.round(inp.x), y: Math.round(out.y) };
  if (strictlyInside(mid, source) || strictlyInside(mid, target)) {
    // Угол L в чужом теле — обходим сбоку по x правее обеих фигур…
    const sideX = Math.max(source.x + source.width, target.x + target.width);
    const side = { x: sideX, y: out.y };
    if (!strictlyInside(side, source) && !strictlyInside(side, target)) {
      mid = side;
    } else {
      // …либо, если и там чужие тела, — вертикальная разводка вне обеих фигур.
      const sideY = targetBelow
        ? Math.max(source.y + source.height, target.y + target.height) + 20
        : Math.min(source.y, target.y) - 20;
      const detour = [
        { x: Math.round(out.x), y: Math.round(out.y) },
        { x: Math.round(out.x), y: Math.round(sideY) },
        { x: Math.round(inp.x), y: Math.round(sideY) },
        { x: Math.round(inp.x), y: Math.round(inp.y) },
      ];
      const result = [detour[0]];
      for (const p of detour.slice(1)) {
        if (p.x !== result[result.length - 1].x || p.y !== result[result.length - 1].y) result.push(p);
      }
      return result;
    }
  }
  const last = { x: Math.round(inp.x), y: Math.round(inp.y) };
  if (mid.x !== pts[0].x || mid.y !== pts[0].y) pts.push(mid);
  if (last.x !== pts[pts.length - 1].x || last.y !== pts[pts.length - 1].y) pts.push(last);
  return pts;
}

/**
 * Полный план «Применить к схеме».
 * @param {{nodes: Array, connections: Array}} input
 *   nodes: {id,type,x,y,width,height,laneKey,laneBounds?,attachedTo?}
 *   connections: {id,sourceId,targetId,waypoints?}
 * @param {{taskWidth?,taskHeight?,sequenceGap?}} geometry сырые настройки
 * @returns {{
 *   positions: Map<string,{x,y,width,height}>,
 *   connectionTranslations: Map<string,{dx,dy}>,
 *   connectionWaypoints: Map<string,Array<{x,y}>>,
 *   stats: {tasksResized,nodesShifted,nodesSkipped,connectionsTranslated,connectionsRerouted},
 *   noop: boolean,
 * }}
 */
export function computeGeometryApplyPlan(input, geometry) {
  const g = sanitizeCanvasGeometry(geometry);
  const nodes = ((input && input.nodes) || []).filter((n) => n && n.id);
  const connections = (input && input.connections) || [];

  if (nodes.length === 0) {
    return {
      positions: new Map(),
      connectionTranslations: new Map(),
      connectionWaypoints: new Map(),
      stats: { tasksResized: 0, nodesShifted: 0, nodesSkipped: 0, connectionsTranslated: 0, connectionsRerouted: 0 },
      noop: true,
    };
  }

  // Фаза 1 — виртуальный ресайз (центры сохранены).
  const resizePlan = computeTaskResizePlan(nodes, g);

  // Пост-ресайз геометрия всех нод (без сдвигов).
  const postRects = new Map();
  for (const node of nodes) {
    const resized = resizePlan.get(node.id);
    const x = Number(node.x);
    const y = Number(node.y);
    const width = Number(node.width);
    const height = Number(node.height);
    if (!Number.isFinite(x) || !Number.isFinite(y) ||
        !Number.isFinite(width) || !Number.isFinite(height)) continue;
    postRects.set(node.id, resized || { x, y, width, height });
  }

  // Flow-рёбра с двумя endpoint-нодами на валидной геометрии.
  const flowEdges = [];
  for (const conn of connections) {
    if (!conn || !conn.id) continue;
    if (!postRects.has(conn.sourceId) || !postRects.has(conn.targetId)) continue;
    flowEdges.push({ id: conn.id, sourceId: conn.sourceId, targetId: conn.targetId });
  }

  // Boundary events наследуют сдвиг хоста: виртуальное ребро host → boundary.
  for (const node of nodes) {
    if (node.attachedTo && postRects.has(node.attachedTo) && postRects.has(node.id)) {
      flowEdges.push({ id: null, sourceId: node.attachedTo, targetId: node.id });
    }
  }

  // Фаза 2+3 — сдвиги с safety: вычисление → read-only verify всех пар →
  // запинить нарушителей → пересчёт, максимум SAFETY_MAX_ITERATIONS итераций.
  // Граница корректна: pinned-множество монотонно растёт и конечно (подмножество
  // нод), каждая незавершённая итерация запинает ≥1 ранее сдвинутого узла, а
  // пересчёт не увеличивает сдвиги (только снимает вклады запиненных) — значит
  // число подвижных узлов строго убывает, и цикл сходится за ≤ N итераций.
  // Cap = 3 прагматичен: на практике конфликты разрешаются первым пересчётом.
  // Если после cap остались пересечения — оставляем как есть; stats.nodesSkipped
  // отражает фактические пропуски (не молчим).
  const SAFETY_MAX_ITERATIONS = 3;
  const pinned = new Set();
  let shift = computeShifts(postRects, flowEdges, g.sequenceGap, pinned);
  const stats = { tasksResized: resizePlan.size, nodesShifted: 0, nodesSkipped: 0, connectionsTranslated: 0, connectionsRerouted: 0 };
  for (let iter = 0; iter < SAFETY_MAX_ITERATIONS; iter += 1) {
    const violators = findSafetyViolators(postRects, flowEdges, shift, pinned);
    if (violators.size === 0) break;
    for (const v of violators) pinned.add(v);
    shift = computeShifts(postRects, flowEdges, g.sequenceGap, pinned);
  }
  stats.nodesSkipped = pinned.size;

  // Позиции: ресайз-геометрия + shift по x; события/шлюзы — исходный размер
  // + shift по x; y НЕ меняется никогда. В positions попадают только узлы,
  // чей финальный прямоугольник отличается от исходного.
  const positions = new Map();
  for (const node of nodes) {
    const base = postRects.get(node.id);
    if (!base) continue;
    const dx = shift.get(node.id) || 0;
    const final = { ...base, x: base.x + dx };
    if (final.x !== Number(node.x) || final.y !== Number(node.y) ||
        final.width !== Number(node.width) || final.height !== Number(node.height)) {
      positions.set(node.id, final);
    }
    if (dx !== 0) stats.nodesShifted += 1;
  }

  // Фаза 5 — стрелки: чистая трансляция при общей дельте, иначе переразводка.
  const connectionTranslations = new Map();
  const connectionWaypoints = new Map();
  for (const conn of connections) {
    if (!conn || !conn.id) continue;
    const dS = postRects.has(conn.sourceId) ? (shift.get(conn.sourceId) || 0) : null;
    const dT = postRects.has(conn.targetId) ? (shift.get(conn.targetId) || 0) : null;
    if (dS === null || dT === null) continue;
    if (dS === 0 && dT === 0) continue;
    if (dS === dT) {
      connectionTranslations.set(conn.id, { dx: dS, dy: 0 });
      stats.connectionsTranslated += 1;
    } else {
      const s = positions.get(conn.sourceId) || postRects.get(conn.sourceId);
      const t = positions.get(conn.targetId) || postRects.get(conn.targetId);
      connectionWaypoints.set(conn.id, computeReroutedWaypoints(s, t));
      stats.connectionsRerouted += 1;
    }
  }

  const noop = positions.size === 0 &&
    connectionTranslations.size === 0 && connectionWaypoints.size === 0;
  return { positions, connectionTranslations, connectionWaypoints, stats, noop };
}
