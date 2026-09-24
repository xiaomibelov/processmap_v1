// laneRowAlign.js — align v2: выравнивание строго внутри лайна,
// стрелки только транслируются.
//
// Постановка (fix/canvas-align-v2):
// 1. Группировка нод по lane (нет lane — по pool). Пересадка в другой
//    lane/pool запрещена — целевые координаты клампятся в границы своего
//    контейнера (margin 10).
// 2. Внутри lane ноды кластеризуются по centerY (порог 40) в ряды.
//    Ряд ≥2 нод: порядок = текущий X, размеры к канону (таска 130×80,
//    событие Ø56, шлюз 50×50), x_{i+1} = round10(x_i + width_i + 100),
//    centerY ряда = round10(медиана centerY нод ряда).
// 3. Всё, что не попало в ряд (ветки, подпроцессы, одиночные ноды), —
//    не трогать ни по позиции, ни по размеру.
// 4. Стрелки: оба конца на одной дельте → все waypoints +дельта; один конец
//    → ломаная +дельта этого конца; разные дельты → +дельта источника.
//    Форма ломаной сохраняется (сдвиг точек, не пересоздание).

export const CANON_NODE_SIZES = {
  task: { width: 130, height: 80 },
  event: { width: 56, height: 56 },
  gateway: { width: 50, height: 50 },
};

export const ALIGN_GAP = 100;
export const ALIGN_ROW_THRESHOLD = 40;
export const ALIGN_LANE_MARGIN = 10;
const ROUND = 10;

export function roundTo10(value) {
  return Math.round(value / ROUND) * ROUND;
}

// Участник ряда — только канон-выравниваемые типы. Подпроцессы и boundary
// события намеренно исключены (постановка: не трогать).
export function canonSizeForAlignType(type) {
  if (typeof type !== "string") return null;
  if (/BoundaryEvent$/.test(type)) return null;
  if (/Event$/.test(type)) return { ...CANON_NODE_SIZES.event };
  if (/Gateway$/.test(type)) return { ...CANON_NODE_SIZES.gateway };
  if (/Task$/.test(type)) return { ...CANON_NODE_SIZES.task };
  return null;
}

function clampIntoLane(x, y, width, height, laneBounds) {
  if (!laneBounds) return { x, y };
  const minX = Number(laneBounds.x) + ALIGN_LANE_MARGIN;
  const minY = Number(laneBounds.y) + ALIGN_LANE_MARGIN;
  const maxX = Number(laneBounds.x) + Number(laneBounds.width) - ALIGN_LANE_MARGIN - width;
  const maxY = Number(laneBounds.y) + Number(laneBounds.height) - ALIGN_LANE_MARGIN - height;
  if (maxX < minX || maxY < minY) return null; // не влезает — не двигаем
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
}

function clusterRows(sortedNodes, threshold) {
  const rows = [];
  let current = [];
  let lastCenterY = null;
  for (const node of sortedNodes) {
    const centerY = node.y + node.height / 2;
    if (current.length > 0 && centerY - lastCenterY > threshold) {
      rows.push(current);
      current = [];
    }
    current.push(node);
    lastCenterY = centerY;
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * @param {{
 *   nodes: Array<{id,type,x,y,width,height,laneKey,laneBounds?}>,
 *   connections: Array<{id,sourceId,targetId,waypoints:Array<{x,y}>}>,
 * }} input
 * @returns {{
 *   positions: Map<string,{x,y,width,height}>,
 *   nodeDeltas: Map<string,{dx,dy}>,
 *   connectionTranslations: Map<string,{dx,dy}>,
 *   stats: {rowsAligned:number,nodesAligned:number,nodesSkipped:number},
 * }}
 */
export function computeLaneRowAlignPlan(input) {
  const nodes = (input.nodes || []).filter((n) => n && n.id);
  const connections = input.connections || [];

  const positions = new Map();
  const nodeDeltas = new Map();
  const stats = { rowsAligned: 0, nodesAligned: 0, nodesSkipped: 0 };

  const groups = new Map();
  for (const node of nodes) {
    const size = canonSizeForAlignType(node.type);
    if (!size) { stats.nodesSkipped += 1; continue; }
    if (!Number.isFinite(Number(node.x)) || !Number.isFinite(Number(node.y))) {
      stats.nodesSkipped += 1;
      continue;
    }
    const key = String(node.laneKey || "__default__");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...node, canon: size });
  }

  for (const [, groupNodes] of groups) {
    const byCenterY = [...groupNodes].sort((a, b) =>
      (a.y + a.height / 2) - (b.y + b.height / 2) || a.x - b.x || String(a.id).localeCompare(String(b.id)));
    const rows = clusterRows(byCenterY, ALIGN_ROW_THRESHOLD);
    for (const row of rows) {
      if (row.length < 2) { stats.nodesSkipped += row.length; continue; }
      stats.rowsAligned += 1;
      const byX = [...row].sort((a, b) => a.x - b.x || String(a.id).localeCompare(String(b.id)));
      const rowCenterY = roundTo10(median(byX.map((n) => n.y + n.height / 2)));
      let cursor = roundTo10(byX[0].x);
      for (const node of byX) {
        const { width, height } = node.canon;
        let target = clampIntoLane(cursor, rowCenterY - height / 2, width, height, node.laneBounds);
        if (!target) { stats.nodesSkipped += 1; cursor = roundTo10(cursor + width + ALIGN_GAP); continue; }
        // Кламп мог сдвинуть x — продолжаем ось от фактической позиции.
        positions.set(node.id, { x: target.x, y: target.y, width, height });
        nodeDeltas.set(node.id, { dx: target.x - node.x, dy: target.y - node.y });
        stats.nodesAligned += 1;
        cursor = roundTo10(target.x + width + ALIGN_GAP);
      }
    }
  }

  // Трансляция стрелок: только сдвиг существующих точек.
  const connectionTranslations = new Map();
  for (const conn of connections) {
    if (!conn || !conn.id) continue;
    const dS = nodeDeltas.get(conn.sourceId);
    const dT = nodeDeltas.get(conn.targetId);
    if (dS && dT) {
      const same = dS.dx === dT.dx && dS.dy === dT.dy;
      connectionTranslations.set(conn.id, same ? { ...dS } : { ...dS });
    } else if (dS) {
      connectionTranslations.set(conn.id, { ...dS });
    } else if (dT) {
      connectionTranslations.set(conn.id, { ...dT });
    }
  }

  return { positions, nodeDeltas, connectionTranslations, stats };
}
