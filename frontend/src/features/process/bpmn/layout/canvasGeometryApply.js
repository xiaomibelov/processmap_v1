// canvasGeometryApply.js — применение настроек геометрии канваса к схеме
// (контур feature/canvas-geometry-apply, шаг 2; фаза 2 переписана контуром
// fix/canvas-geometry-apply-topology; фаза стрелок — контуром
// fix/canvas-geometry-apply-routing: grid-A* роутинг вместо manhattan-L).
//
// Чистые функции без bpmn-js-вайринга (тестируемы через node --test).
// Зависимости направлены строго в одну сторону:
//   canvasGeometryApply → canvasGeometryRouting, canvasGeometry
// (циклов нет; align-ряды больше не используются — глобальная перекладка
// рядов удалена topology-контуром, регресс align = 0, gate-тест следит).
//
// Состав операции «Применить к схеме»:
// 1. Ресайз ВСЕХ тасков (bpmn:Task и подтипы, /Task$/) до настроенного
//    taskWidth × taskHeight, якорь — центр фигуры (канон-ресайз align).
// 2. Локальная нормализация зазоров вдоль потока (см. контур topology):
//    сдвиги каскадируются вправо по flow-рёбрам, y не меняются никогда.
// 3. Safety: небезопасные сдвиги отменяются (stats.nodesSkipped).
// 4. Boundary events наследуют сдвиг хоста (attachedTo), не ресайзятся.
// 5. Стрелки: оба конца на одной дельте → чистая трансляция {dx,dy};
//    дельты разные / один конец → переразводка grid-A* роутером с обходом
//    препятствий и occupancy-каналами (canvasGeometryRouting.js);
//    connectivity-gate fail-closed: невалидный reroute → трансляция,
//    невалидная трансляция → связь без изменений + stats.connectionsSkipped.

import {
  CANON_GEOMETRY_DEFAULTS,
  CANVAS_GEOMETRY_BOUNDS,
} from "./canvasGeometry.js";
import {
  findChannelConflicts,
  routeConnection,
  validateConnectionGeometry,
} from "./canvasGeometryRouting.js";

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

function emptyStats() {
  return {
    tasksResized: 0,
    nodesShifted: 0,
    nodesSkipped: 0,
    connectionsTranslated: 0,
    connectionsRerouted: 0,
    connectionsSkipped: 0,
    connectionsChannelConflicts: 0,
  };
}

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

// --- Фаза 5: переразводка стрелок — grid-A* роутер (canvasGeometryRouting.js) ---

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
      stats: emptyStats(),
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
  const stats = emptyStats();
  stats.tasksResized = resizePlan.size;
  for (let iter = 0; iter < SAFETY_MAX_ITERATIONS; iter += 1) {
    const violators = findSafetyViolators(postRects, flowEdges, shift, pinned);
    if (violators.size === 0) break;
    for (const v of violators) pinned.add(v);
    shift = computeShifts(postRects, flowEdges, g.sequenceGap, pinned);
  }
  stats.nodesSkipped = pinned.size;

  // Финальные прямоугольники всех нод (пост-ресайз + применённый сдвиг) —
  // используются роутером и гейтом.
  const finalRects = new Map();
  for (const node of nodes) {
    const base = postRects.get(node.id);
    if (!base) continue;
    finalRects.set(node.id, { ...base, x: base.x + (shift.get(node.id) || 0) });
  }

  // Позиции: в positions попадают только узлы, чей финальный прямоугольник
  // отличается от исходного (y НЕ меняется никогда).
  const positions = new Map();
  for (const node of nodes) {
    const final = finalRects.get(node.id);
    if (!final) continue;
    const dx = shift.get(node.id) || 0;
    if (final.x !== Number(node.x) || final.y !== Number(node.y) ||
        final.width !== Number(node.width) || final.height !== Number(node.height)) {
      positions.set(node.id, final);
    }
    if (dx !== 0) stats.nodesShifted += 1;
  }

  // Фаза 5 — стрелки. Детерминированный порядок (сортировка по id связи),
  // grid-A* с occupancy-каналами; connectivity-gate fail-closed: невалидный
  // reroute → откат к трансляции; невалидная трансляция → связь без изменений
  // + stats.connectionsSkipped. Пост-проход разводит остаточные конфликты
  // каналов (коллинеарные наложения / параллельные ближе 10px).
  // Boundary-исходящие связи: хост boundary-эвента не считается препятствием
  // (круг boundary сидит на границе хоста — выход из-под тела хоста легален
  // по семантике BPMN; строгий запрет стены делает такие связи неразводимыми).
  // Осознанное ограничение (review n1): исключение bbox-wide — маршрут BE→X
  // теоретически может пройти ТЕЛОМ через bbox хоста (не только «выходом из-под
  // него»); якоря sideAnchors + inflate делают это маловероятным, валидация
  // согласована (хост исключён из foreign для таких связей).
  const attachedHost = new Map();
  for (const node of nodes) {
    if (node.attachedTo && finalRects.has(node.attachedTo)) attachedHost.set(node.id, node.attachedTo);
  }

  const connectionTranslations = new Map();
  const connectionWaypoints = new Map();
  const occupied = new Set();
  const occupiedKeysByConn = new Map();

  const foreignFor = (conn) => {
    const out = [];
    const hostOfSource = attachedHost.get(conn.sourceId);
    const hostOfTarget = attachedHost.get(conn.targetId);
    for (const [id, r] of finalRects) {
      if (id === conn.sourceId || id === conn.targetId) continue;
      if (id === hostOfSource || id === hostOfTarget) continue;
      out.push({ id, ...r });
    }
    return out;
  };
  const translateWaypoints = (conn, dx) =>
    (conn.waypoints || []).map((p) => ({ x: p.x + dx, y: p.y }));
  const validateReroute = (conn, pts) =>
    validateConnectionGeometry({
      source: finalRects.get(conn.sourceId),
      target: finalRects.get(conn.targetId),
      waypoints: pts,
      foreignRects: foreignFor(conn),
      tolerance: 1,
      endSlack: 0,
    }).ok;
  const validateTranslation = (conn, pts) =>
    validateConnectionGeometry({
      source: finalRects.get(conn.sourceId),
      target: finalRects.get(conn.targetId),
      waypoints: pts,
      foreignRects: foreignFor(conn),
      tolerance: 1,
      endSlack: 20, // трансляция сохраняет исходную форму: мелкий дрейф endpoint'ов после ресайза кропится отрисовкой
    }).ok;
  const routeWithOccupancy = (conn, blockedRects = []) => {
    const before = occupied.size;
    const pts = routeConnection({
      source: finalRects.get(conn.sourceId),
      target: finalRects.get(conn.targetId),
      foreignRects: foreignFor(conn),
      occupied,
      blockedRects,
    });
    if (!pts) return null;
    occupiedKeysByConn.set(conn.id, [...occupied].slice(before));
    return pts;
  };
  const releaseOccupancy = (connId) => {
    for (const k of occupiedKeysByConn.get(connId) || []) occupied.delete(k);
    occupiedKeysByConn.delete(connId);
  };

  const sortedConns = connections
    .filter((c) => c && c.id && Array.isArray(c.waypoints) &&
      finalRects.has(c.sourceId) && finalRects.has(c.targetId))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  for (const conn of sortedConns) {
    const dS = shift.get(conn.sourceId) || 0;
    const dT = shift.get(conn.targetId) || 0;
    if (dS === 0 && dT === 0) continue; // без дельт связь не трогаем
    let op = null;
    if (dS !== dT) {
      const pts = routeWithOccupancy(conn);
      if (pts && validateReroute(conn, pts)) {
        op = { kind: "reroute", pts };
      } else {
        if (pts) releaseOccupancy(conn.id);
        const tr = { dx: dS, dy: 0 };
        if (validateTranslation(conn, translateWaypoints(conn, dS))) op = { kind: "translate", tr };
      }
    } else {
      const tr = { dx: dS, dy: 0 };
      if (validateTranslation(conn, translateWaypoints(conn, dS))) {
        op = { kind: "translate", tr };
      } else {
        const pts = routeWithOccupancy(conn);
        if (pts && validateReroute(conn, pts)) op = { kind: "reroute", pts };
        else if (pts) releaseOccupancy(conn.id);
      }
    }
    if (!op) {
      stats.connectionsSkipped += 1; // честный пропуск: ни reroute, ни трансляция не валидны
      continue;
    }
    if (op.kind === "translate") {
      connectionTranslations.set(conn.id, op.tr);
      stats.connectionsTranslated += 1;
    } else {
      connectionWaypoints.set(conn.id, op.pts);
      stats.connectionsRerouted += 1;
    }
  }

  // Пост-проход каналов (вынесен в чистую функцию — тестируем напрямую).
  const remainingConflicts = resolveChannelConflicts(connectionWaypoints, (offenderId, corridor) => {
    const conn = sortedConns.find((c) => c.id === offenderId);
    if (!conn) return null;
    releaseOccupancy(offenderId);
    const pts = routeWithOccupancy(conn, [corridor]);
    if (pts && validateReroute(conn, pts)) return pts;
    if (pts) releaseOccupancy(offenderId);
    return null; // развести не удалось — прежний маршрут, конфликт честно в stats
  });
  stats.connectionsChannelConflicts = remainingConflicts.length;

  const noop = positions.size === 0 &&
    connectionTranslations.size === 0 && connectionWaypoints.size === 0;
  return { positions, connectionTranslations, connectionWaypoints, stats, noop };
}

// resolveChannelConflicts — пост-проход каналов: развести остаточные конфликты
// (коллинеарные наложения / параллельные ближе 10px) между уже разведёнными
// связями. Максимум 3 попытки; на каждой нарушитель (связь с большим id —
// позже разводилась) переразводится с блокировкой коридора ПРОТИВНИКА.
// Ворк-эффекты (occupancy/валидация) — на tryReroute; здесь только стратегия.
// В плане конфликт сюда обычно не доходит (occupancy разносит каналы ≥10px) —
// это fail-visible слой на случай будущих изменений роутинга.
export function resolveChannelConflicts(connectionWaypoints, tryReroute) {
  let conflicts = findChannelConflicts(connectionWaypoints);
  let attempts = 0;
  while (conflicts.length > 0 && attempts < 3) {
    attempts += 1;
    const conf = conflicts[0];
    const offender = String(conf.a).localeCompare(String(conf.b)) >= 0 ? conf.a : conf.b;
    const other = offender === conf.a ? conf.b : conf.a;
    const otherPts = connectionWaypoints.get(other);
    if (!otherPts) break;
    // Индекс сегмента ПРОТИВНИКА (не нарушителя): коридор строим по чужому
    // сегменту, иначе при разном числе сегментов получим undefined/NaN (review r1).
    const segIdx = offender === conf.a ? conf.bSeg : conf.aSeg;
    const a = otherPts[segIdx];
    const b = otherPts[segIdx + 1];
    if (!a || !b) break;
    const corridor = {
      x: Math.min(a.x, b.x) - 1,
      y: Math.min(a.y, b.y) - 1,
      width: Math.abs(a.x - b.x) + 2,
      height: Math.abs(a.y - b.y) + 2,
    };
    const pts = tryReroute(offender, corridor);
    if (!pts) break;
    connectionWaypoints.set(offender, pts);
    conflicts = findChannelConflicts(connectionWaypoints);
  }
  return conflicts;
}
