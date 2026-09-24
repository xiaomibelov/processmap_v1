// canonLayout.js — каноническая раскладка главной оси диаграммы.
//
// Постановка:
// 1. Порядок главной оси — топологический от стартовых событий; обратные
//    рёбра (в уже посещённые ноды) — петли, ноды не двигают.
// 2. x_{i+1} = x_i + width_i + GAP(100); все centerY на одной оси Y0.
//    Канонические размеры: таска 130×80, событие Ø56, шлюз 50×50.
// 3. Петли: ортогональная разводка, 1-й лейн = Y0+200, каждая следующая
//    перекрывающаяся параллельная петля +80.
// 4. Все координаты округляются до кратных 10.

export const CANON_LAYOUT = {
  GAP: 100,
  LOOP_LANE_FIRST_OFFSET: 200,
  LOOP_LANE_STEP: 80,
  ROUND: 10,
  SIZES: {
    task: { width: 130, height: 80 },
    event: { width: 56, height: 56 },
    gateway: { width: 50, height: 50 },
  },
};

export function roundTo10(value) {
  return Math.round(value / CANON_LAYOUT.ROUND) * CANON_LAYOUT.ROUND;
}

function canonSizeForType(type, current) {
  if (typeof type !== "string") return { ...current };
  if (/Event$/.test(type)) return { ...CANON_LAYOUT.SIZES.event };
  if (/Gateway$/.test(type)) return { ...CANON_LAYOUT.SIZES.gateway };
  if (/Task$/.test(type)) return { ...CANON_LAYOUT.SIZES.task };
  return { ...current };
}

function isStartEventType(type) {
  return type === "bpmn:StartEvent";
}

// DFS от стартовых событий, исходящие рёбра в порядке (x, y) цели.
// Ребро в уже посещённую ноду — back-edge (петля), порядок не меняет.
// После DFS оставшиеся недостижимые ноды добираются по (x, y) — хвост оси.
function topoOrder(nodes, flows) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  const backEdges = [];
  const loopWaypoints = new Map();
  for (const f of flows) {
    if (!byId.has(f.sourceId) || !byId.has(f.targetId)) continue;
    if (f.sourceId === f.targetId) {
      backEdges.push(f); // self-loop — петля, порядок не влияет
      continue;
    }
    outgoing.get(f.sourceId).push(f);
  }

  const cmpXY = (a, b) => (a.x - b.x) || (a.y - b.y) || String(a.id).localeCompare(String(b.id));
  for (const list of outgoing.values()) {
    list.sort((fa, fb) => cmpXY(byId.get(fa.targetId), byId.get(fb.targetId)));
  }

  const order = [];
  const visited = new Set();
  const visit = (node) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    order.push(node.id);
    for (const f of outgoing.get(node.id) || []) {
      const target = byId.get(f.targetId);
      if (visited.has(f.targetId)) {
        backEdges.push(f);
      } else {
        visit(target);
      }
    }
  };

  const starts = nodes
    .filter((n) => isStartEventType(n.type))
    .sort(cmpXY);
  for (const s of starts) visit(s);
  // Хвост: недостижимые ноды по (x, y).
  for (const n of nodes.filter((x) => !visited.has(x.id)).sort(cmpXY)) {
    visit(n);
  }

  // Разводка петель: лейн Y0+200+k*80; k растёт, только если x-интервал
  // петли перекрывается с уже разведённой на этом лейне.
  return { order, visited, backEdges, loopWaypoints, byId };
}

function overlaps(a, b) {
  return a[0] < b[1] && b[0] < a[1];
}

/**
 * @param {{nodes: Array, flows: Array}} input ноды с текущими bounds и flows
 *        вида {id, sourceId, targetId}.
 * @returns {{
 *   positions: Map<string, {x:number,y:number,width:number,height:number}>,
 *   loopWaypoints: Map<string, Array<{x:number,y:number}>>,
 *   backEdges: string[],
 *   forwardEdges: string[],
 *   axisOrder: string[],
 *   Y0: number,
 * }}
 */
export function computeCanonLayout(input) {
  const nodes = input.nodes || [];
  const flows = input.flows || [];
  const { order, backEdges, byId } = topoOrder(nodes, flows);

  const positions = new Map();
  if (order.length === 0) {
    return { positions, loopWaypoints: new Map(), backEdges: [], forwardEdges: [], axisOrder: [], Y0: 0 };
  }

  const first = byId.get(order[0]);
  const Y0 = roundTo10(first.y + first.height / 2);
  let cursor = roundTo10(first.x);

  for (const id of order) {
    const node = byId.get(id);
    const size = canonSizeForType(node.type, { width: node.width, height: node.height });
    positions.set(id, {
      x: cursor,
      y: Y0 - size.height / 2,
      width: size.width,
      height: size.height,
    });
    cursor = roundTo10(cursor + size.width + CANON_LAYOUT.GAP);
  }

  // Пересчёт waypoints петель от уже разложенных позиций.
  const laneAssignments = []; // [{interval, laneIndex}]
  const loopWaypoints = new Map();
  for (const f of backEdges) {
    const src = positions.get(f.sourceId);
    const tgt = positions.get(f.targetId);
    if (!src || !tgt) continue;
    const interval = [
      Math.min(src.x + src.width / 2, tgt.x + tgt.width / 2),
      Math.max(src.x + src.width / 2, tgt.x + tgt.width / 2),
    ];
    let laneIndex = 0;
    // ищем первый лейн без перекрытия интервалов
    for (;;) {
      const taken = laneAssignments.filter(
        (a) => a.laneIndex === laneIndex && overlaps(a.interval, interval),
      );
      if (taken.length === 0) break;
      laneIndex += 1;
    }
    laneAssignments.push({ interval, laneIndex });

    const laneY = Y0 + CANON_LAYOUT.LOOP_LANE_FIRST_OFFSET + laneIndex * CANON_LAYOUT.LOOP_LANE_STEP;
    const srcCenterX = src.x + src.width / 2;
    const tgtCenterX = tgt.x + tgt.width / 2;
    const srcBottomY = src.y + src.height;
    const tgtBottomY = tgt.y + tgt.height;
    const waypointsRaw = [
      { x: roundTo10(srcCenterX), y: roundTo10(srcBottomY) },
      { x: roundTo10(srcCenterX), y: roundTo10(laneY) },
      { x: roundTo10(tgtCenterX), y: roundTo10(laneY) },
      { x: roundTo10(tgtCenterX), y: roundTo10(tgtBottomY) },
    ];
    // self-loop даёт вырожденные точки A→B→B→A — схлопываем дубликаты.
    const waypoints = waypointsRaw.filter(
      (p, i) => i === 0 || p.x !== waypointsRaw[i - 1].x || p.y !== waypointsRaw[i - 1].y,
    );
    loopWaypoints.set(f.id, waypoints);
  }

  const forwardEdges = flows
    .map((f) => f.id)
    .filter((id) => !loopWaypoints.has(id));

  return {
    positions,
    loopWaypoints,
    backEdges: backEdges.map((f) => f.id),
    forwardEdges,
    axisOrder: order,
    Y0,
  };
}
