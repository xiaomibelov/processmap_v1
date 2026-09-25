// canvasGeometryRouting.js — grid-A* роутинг секвенс-флоуов для операции
// «Применить к схеме» (контур fix/canvas-geometry-apply-routing).
//
// Замещает manhattan-L переразводку v1.0.156 (computeReroutedWaypoints), которая
// не знала препятствий: стрелки шли сквозь тела фигур, а параллельные секвенсы
// совпадали сегментами (баг-репорт §2.1–§2.2).
//
// Модель:
//   - сетка 10px, 4-связная (ортогональность по построению);
//   - чужие bbox «раздуты» margin 10px — ячейка внутри = препятствие;
//   - старт/стоп — середины сторон по направлению (снап к сетке по свободной
//     оси, граничная координата — точная), внутри СВОИХ фигур ходить можно;
//   - cost = steps + ROUTING_BEND_PENALTY * bends (чистота маршрута);
//   - occupancy: ячейки занятых каналов (+соседи, ≥10px разнос) блокируются
//     для последующих связей; порядок разводки — сортировка по id связи
//     (детерминизм, важен для undo/тестов);
//   - бюджет расширений узлов: при исчерпании → null (честный пропуск,
//     решает вызывающая сторона через connectivity-gate).
//
// Зависимостей на другие модули layout НЕТ (gate направления импортов:
// canvasGeometryApply → canvasGeometryRouting, обратная запрещена).

export const ROUTING_GRID = 10;
export const ROUTING_MARGIN = 10;
export const ROUTING_BEND_PENALTY = 3;
export const ROUTING_EXPANSION_BUDGET = 200000;
export const ROUTING_MAX_CELLS = 4000000;
// Минимальный разнос параллельных каналов разных связей.
export const ROUTING_CHANNEL_DISTANCE = ROUTING_GRID;

function snap(value) {
  return Math.round(value / ROUTING_GRID) * ROUTING_GRID;
}

function inflateRect(r, m) {
  return { x: r.x - m, y: r.y - m, width: r.width + 2 * m, height: r.height + 2 * m };
}

function pointInRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

function strictlyInside(p, r) {
  return p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
}

export { strictlyInside };

// --- коридор выхода boundary-хоста ---

/**
 * Коридор выхода для исходящей связи boundary-эвента: полоса от якоря до выхода
 * за пределы inflate'd bbox хоста, шириной 1 ячейка сетки по обе стороны оси.
 * Ось — перпендикуляр из ближайшей грани хоста (boundary в углу: ближайшая
 * грань; тупик здесь — честный пропуск уровнем выше).
 * Единый источник corridor-rect: используется и grid-subtraction'ом роутера,
 * и валидацией (согласованность по построению).
 * @returns {Rect|null} null — якорь не у какой-либо грани (внутри тела/вдали).
 */
export function computeExitCorridor(hostRect, anchor) {
  const G = ROUTING_GRID;
  const M = ROUTING_MARGIN;
  const faces = [
    { d: Math.abs(anchor.y - (hostRect.y + hostRect.height)), side: "s" },
    { d: Math.abs(anchor.y - hostRect.y), side: "n" },
    { d: Math.abs(anchor.x - (hostRect.x + hostRect.width)), side: "e" },
    { d: Math.abs(anchor.x - hostRect.x), side: "w" },
  ].filter((f) => f.d <= G &&
    (f.side === "s" || f.side === "n"
      ? anchor.x >= hostRect.x - G && anchor.x <= hostRect.x + hostRect.width + G
      : anchor.y >= hostRect.y - G && anchor.y <= hostRect.y + hostRect.height + G));
  if (!faces.length) return null;
  faces.sort((a, b) => a.d - b.d || "snew".indexOf(a.side) - "snew".indexOf(b.side));
  const f = faces[0].side;
  const ax = snap(anchor.x);
  const ay = snap(anchor.y);
  if (f === "s") return { x: ax - G, y: hostRect.y + hostRect.height, width: 3 * G, height: M + G };
  if (f === "n") return { x: ax - G, y: hostRect.y - M - G, width: 3 * G, height: M + G };
  if (f === "e") return { x: hostRect.x + hostRect.width, y: ay - G, width: M + G, height: 3 * G };
  return { x: hostRect.x - M - G, y: ay - G, width: M + G, height: 3 * G };
}

/**
 * Пересечение отрезка с ВНУТРЕННОСТЬЮ прямоугольника. Касание грани — не пересечение.
 */
export function segmentRectCross(a, b, r) {
  if (strictlyInside(a, r) || strictlyInside(b, r)) return true;
  const edges = [
    [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }],
    [{ x: r.x, y: r.y + r.height }, { x: r.x + r.width, y: r.y + r.height }],
    [{ x: r.x, y: r.y }, { x: r.x, y: r.y + r.height }],
    [{ x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }],
  ];
  const d = (o, p2, q) => (q.x - o.x) * (p2.y - o.y) - (q.y - o.y) * (p2.x - o.x);
  return edges.some(([e1, e2]) => {
    const d1 = d(e1, a, b);
    const d2 = d(e2, a, b);
    const d3 = d(a, e1, e2);
    const d4 = d(b, e1, e2);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  });
}

// --- валидация связности ---

function onBoundary(p, r, tol) {
  const within = p.x >= r.x - tol && p.x <= r.x + r.width + tol &&
    p.y >= r.y - tol && p.y <= r.y + r.height + tol;
  if (!within) return false;
  const onV = Math.abs(p.x - r.x) <= tol || Math.abs(p.x - (r.x + r.width)) <= tol;
  const onH = Math.abs(p.y - r.y) <= tol || Math.abs(p.y - (r.y + r.height)) <= tol;
  return onV || onH;
}

function distToRect(p, r) {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
  return Math.hypot(dx, dy);
}

/**
 * Connectivity-gate одной связи.
 * @param {{source:Rect,target:Rect,waypoints:Array<{x,y}>,foreignRects:Array<Rect>,
 *          hostExits?: Array<{hostId?:string,host:Rect,corridor:Rect|null}>,
 *          tolerance?:number,endSlack?:number}} input
 *   tolerance — допуск «на границе» (default 1); endSlack — допуск расстояния
 *   до своей фигуры для endpoint'а (default 0; для трансляций — 20: bpmn-js
 *   кропит отрисовку к контуру, мелкий дрейф после ресайза незаметен).
 *   hostExits — для исходящих boundary-связей: host-bbox входит в foreignRects,
 *   но пересечение с ним разрешено ТОЛЬКО внутри коридора выхода (corridor:null
 *   → любое пересечение с хостом invalid, fail-closed).
 * @returns {{ok:true}|{ok:false,reason:string}}
 */
export function validateConnectionGeometry(input) {
  const { source, target, waypoints, foreignRects } = input;
  const tolerance = input.tolerance ?? 1;
  const endSlack = input.endSlack ?? 0;
  const hostExits = input.hostExits || [];
  // Сопоставление host↔foreign-rect: план передаёт КОПИИ ({id,...r}), unit-вход —
  // один объект. Ключ — hostId с fallback на идентичность объектов (review bh1).
  const exitById = new Map();
  const exitByRef = new Map();
  for (const he of hostExits) {
    if (he.hostId !== undefined && he.hostId !== null) exitById.set(he.hostId, he.corridor);
    if (he.host) exitByRef.set(he.host, he.corridor);
  }
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return { ok: false, reason: "few_waypoints" };
  }
  const first = waypoints[0];
  const last = waypoints[waypoints.length - 1];
  if (waypoints.every((p) => p.x === first.x && p.y === first.y)) {
    return { ok: false, reason: "collapsed" };
  }
  const endpointOk = (p, r) => onBoundary(p, r, tolerance) || distToRect(p, r) <= endSlack;
  if (!endpointOk(first, source)) return { ok: false, reason: "start_detached" };
  if (!endpointOk(last, target)) return { ok: false, reason: "end_detached" };
  const inRect = (p, r) => r && p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
  for (const r of foreignRects || []) {
    const corridor = exitById.has(r && r.id) ? exitById.get(r.id) : exitByRef.get(r);
    if (corridor !== undefined) {
      // host boundary: внутри host-bbox разрешены ТОЛЬКО коридор выхода и
      // собственное тело boundary-эвента (круг сидит на границе, его
      // «внутренняя» половина — легальное перекрытие, не проход телом).
      const allowed = (p) => inRect(p, corridor) || pointInRect(p, source);
      for (const p of waypoints) {
        if (strictlyInside(p, r) && !allowed(p)) {
          return { ok: false, reason: "point_inside_host_outside_corridor" };
        }
      }
      for (let i = 1; i < waypoints.length; i += 1) {
        const a = waypoints[i - 1];
        const b = waypoints[i];
        if (segmentRectCross(a, b, r) && !(allowed(a) && allowed(b))) {
          return { ok: false, reason: "segment_crosses_host_outside_corridor" };
        }
      }
      continue;
    }
    for (const p of waypoints) {
      if (strictlyInside(p, r)) return { ok: false, reason: "point_inside_foreign" };
    }
    for (let i = 1; i < waypoints.length; i += 1) {
      if (segmentRectCross(waypoints[i - 1], waypoints[i], r)) {
        return { ok: false, reason: "segment_crosses_foreign" };
      }
    }
  }
  return { ok: true };
}

// --- каналы: коллинеарные наложения и близкие параллельные ---

function segsOf(pts) {
  const out = [];
  for (let i = 1; i < pts.length; i += 1) out.push([pts[i - 1], pts[i]]);
  return out;
}

function overlap1D(a1, a2, b1, b2) {
  return Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2));
}

/**
 * Конфликты каналов между РАЗНЫМИ связями: коллинеарные сегменты на одной прямой
 * с перекрытием > 0, либо параллельные на расстоянии < ROUTING_CHANNEL_DISTANCE
 * при перекрытии проекций. Перпендикулярные пересечения стрелок — норма BPMN.
 * @param {Map<string,Array<{x,y}>>} routed
 * @returns {Array<{a:string,b:string,aSeg:number,bSeg:number}>}
 */
export function findChannelConflicts(routed) {
  const ids = [...routed.keys()];
  const conflicts = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const segsA = segsOf(routed.get(ids[i]));
      const segsB = segsOf(routed.get(ids[j]));
      for (let sa = 0; sa < segsA.length; sa += 1) {
        for (let sb = 0; sb < segsB.length; sb += 1) {
          const [a1, a2] = segsA[sa];
          const [b1, b2] = segsB[sb];
          const hA = a1.y === a2.y; const hB = b1.y === b2.y;
          if (hA !== hB) continue;
          if (hA) {
            const dist = Math.abs(a1.y - b1.y);
            const ov = overlap1D(a1.x, a2.x, b1.x, b2.x);
            if (ov > 0 && dist < ROUTING_CHANNEL_DISTANCE) {
              conflicts.push({ a: ids[i], b: ids[j], aSeg: sa, bSeg: sb });
            }
          } else {
            const dist = Math.abs(a1.x - b1.x);
            const ov = overlap1D(a1.y, a2.y, b1.y, b2.y);
            if (ov > 0 && dist < ROUTING_CHANNEL_DISTANCE) {
              conflicts.push({ a: ids[i], b: ids[j], aSeg: sa, bSeg: sb });
            }
          }
        }
      }
    }
  }
  return conflicts;
}

// --- grid A* ---

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // фиксированный порядок — детерминизм

function sideAnchors(rect, toward) {
  // midpoint грани по направлению к «toward»; ось вдоль грани снапится к сетке.
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const east = { x: rect.x + rect.width, y: snap(cy), side: "e" };
  const west = { x: rect.x, y: snap(cy), side: "w" };
  const south = { x: snap(cx), y: rect.y + rect.height, side: "s" };
  const north = { x: snap(cx), y: rect.y, side: "n" };
  if (toward.x > cx + 1) return [east, toward.y >= cy ? south : north, toward.y >= cy ? north : south, west];
  if (toward.x < cx - 1) return [west, toward.y >= cy ? south : north, toward.y >= cy ? north : south, east];
  return [toward.y >= cy ? south : north, toward.y >= cy ? north : south, east, west];
}

/**
 * Разводка одной связи ортогональным маршрутом с обходом препятствий.
 * @param {{
 *   source: Rect, target: Rect,
 *   foreignRects: Array<Rect>,          // препятствия (будут раздуты на margin)
 *   occupied: Set<string>,              // "i,j" занятых ячеек (мутируется при успехе)
 *                                        // КОНТРАКТ (review n2): occupied валидна
 *                                        // только при ПОЛНОМ пуле фигур — общий
 *                                        // grid-origin у всех вызовов. В плане
 *                                        // пул всегда полный (все finalRects);
 *                                        // unit-вызовы с частичным пулом — вне
 *                                        // контракта (origin'ы расходятся).
 *   blockedRects?: Array<Rect>,         // доп. препятствия (коридоры конфликтов)
 *   exitHost?: Rect,                    // host boundary-эвента (для исходящих
 *                                        // boundary-связей): host ДОЛЖЕН быть в
 *                                        // foreignRects; его ячейки блокируются
 *                                        // кроме коридора выхода (computeExitCorridor
 *                                        // от выбранного якоря — единый источник)
 *   expansionBudget?: number,
 * }} input
 * @returns {Array<{x,y}>|null} waypoints (кратны сетке) или null.
 */
export function routeConnection(input) {
  const { source, target } = input;
  const foreign = (input.foreignRects || []).map((r) => inflateRect(r, ROUTING_MARGIN));
  const extra = (input.blockedRects || []).map((r) => inflateRect(r, ROUTING_GRID));
  const exitHost = input.exitHost || null;
  const occupied = input.occupied || new Set();
  const budget = input.expansionBudget ?? ROUTING_EXPANSION_BUDGET;

  const allRects = [source, target, ...(input.foreignRects || [])];
  let minX = Math.min(...allRects.map((r) => r.x)) - 100;
  let minY = Math.min(...allRects.map((r) => r.y)) - 100;
  let maxX = Math.max(...allRects.map((r) => r.x + r.width)) + 100;
  let maxY = Math.max(...allRects.map((r) => r.y + r.height)) + 100;
  minX = snap(minX); minY = snap(minY); maxX = snap(maxX); maxY = snap(maxY);
  const w = Math.round((maxX - minX) / ROUTING_GRID);
  const h = Math.round((maxY - minY) / ROUTING_GRID);
  if (w <= 0 || h <= 0 || w * h > ROUTING_MAX_CELLS) return null;

  const cellOf = (p) => [Math.round((p.x - minX) / ROUTING_GRID), Math.round((p.y - minY) / ROUTING_GRID)];
  const coordOf = (i, j) => ({ x: minX + i * ROUTING_GRID, y: minY + j * ROUTING_GRID });
  const insideOwn = (i, j) => {
    const c = coordOf(i, j);
    return pointInRect(c, source) || pointInRect(c, target);
  };

  // базовые препятствия
  const base = new Uint8Array(w * h);
  const markRect = (r) => {
    const i0 = Math.max(0, Math.floor((r.x - minX) / ROUTING_GRID));
    const j0 = Math.max(0, Math.floor((r.y - minY) / ROUTING_GRID));
    const i1 = Math.min(w - 1, Math.floor((r.x + r.width - minX) / ROUTING_GRID));
    const j1 = Math.min(h - 1, Math.floor((r.y + r.height - minY) / ROUTING_GRID));
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) base[j * w + i] = 1;
    }
  };
  foreign.forEach(markRect);
  extra.forEach(markRect);

  const blockedAt = (i, j) => {
    if (i < 0 || j < 0 || i >= w || j >= h) return true;
    if (base[j * w + i]) return !insideOwn(i, j);
    if (occupied.has(`${i},${j}`)) return !insideOwn(i, j);
    return false;
  };

  // минимальная бинарная куча по f
  const heap = [];
  const push = (node) => {
    heap.push(node);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p].f <= heap[k].f) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1; const r = 2 * k + 2;
        let m = k;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };

  const starts = sideAnchors(source, { x: target.x + target.width / 2, y: target.y + target.height / 2 });
  const stops = sideAnchors(target, { x: source.x + source.width / 2, y: source.y + source.height / 2 });

  for (const start of starts) {
    // boundary-host: коридор выхода от выбранного якоря; якорь вне граней —
    // не подходит (выход только через коридор).
    let corridor = null;
    if (exitHost) {
      corridor = computeExitCorridor(exitHost, start);
      if (!corridor) continue;
    }
    for (const stop of stops) {
      const [si, sj] = cellOf(start);
      const [ti, tj] = cellOf(stop);
      // grid-subtraction коридора: ячейки внутри corridor-rect разблокируются
      const cleared = [];
      if (corridor) {
        const ci0 = Math.max(0, Math.floor((corridor.x - minX) / ROUTING_GRID));
        const cj0 = Math.max(0, Math.floor((corridor.y - minY) / ROUTING_GRID));
        const ci1 = Math.min(w - 1, Math.floor((corridor.x + corridor.width - minX) / ROUTING_GRID));
        const cj1 = Math.min(h - 1, Math.floor((corridor.y + corridor.height - minY) / ROUTING_GRID));
        for (let j = cj0; j <= cj1; j += 1) {
          for (let i = ci0; i <= ci1; i += 1) {
            const idx = j * w + i;
            if (base[idx]) { base[idx] = 0; cleared.push(idx); }
          }
        }
      }
      if (blockedAt(si, sj) || blockedAt(ti, tj)) continue;
      const gScore = new Float64Array(w * h).fill(Infinity);
      const dirOf = new Int8Array(w * h).fill(-1);
      const parent = new Int32Array(w * h).fill(-1);
      const startIdx = sj * w + si;
      const h0 = Math.abs(ti - si) + Math.abs(tj - sj);
      gScore[startIdx] = 0;
      push({ i: si, j: sj, f: h0, idx: startIdx });
      let expansions = 0;
      let found = false;
      while (heap.length > 0) {
        const cur = pop();
        const curIdx = cur.j * w + cur.i;
        if (cur.i === ti && cur.j === tj) { found = true; break; }
        expansions += 1;
        if (expansions > budget) break;
        const curDir = dirOf[curIdx];
        for (let d = 0; d < 4; d += 1) {
          const [dx, dy] = DIRS[d];
          const ni = cur.i + dx; const nj = cur.j + dy;
          if (blockedAt(ni, nj)) continue;
          const nIdx = nj * w + ni;
          const turn = curDir !== -1 && curDir !== d ? 1 : 0;
          const ng = gScore[curIdx] + 1 + ROUTING_BEND_PENALTY * turn;
          if (ng < gScore[nIdx]) {
            gScore[nIdx] = ng;
            dirOf[nIdx] = d;
            parent[nIdx] = curIdx;
            const nh = Math.abs(ti - ni) + Math.abs(tj - nj);
            push({ i: ni, j: nj, f: ng + nh, idx: nIdx });
          }
        }
      }
      heap.length = 0;
      if (!found) {
        // откат grid-subtraction коридора перед следующей попыткой якоря
        for (const idx of cleared) base[idx] = 1;
        continue;
      }

      // реконструкция пути
      const cells = [];
      let idx = tj * w + ti;
      while (idx !== -1) {
        cells.push(idx);
        idx = parent[idx];
      }
      cells.reverse();
      // waypoints: старт-якорь → точки поворотов → стоп-якорь (всё кратно сетке)
      const pts = [{ x: start.x, y: start.y }];
      let prevDir = null;
      for (let k = 1; k < cells.length; k += 1) {
        const pi = cells[k] % w; const pj = Math.floor(cells[k] / w);
        const ci = cells[k - 1] % w; const cj = Math.floor(cells[k - 1] / w);
        const d = pi > ci ? 0 : pi < ci ? 2 : pj > cj ? 1 : 3;
        if (prevDir !== null && d !== prevDir) {
          pts.push(coordOf(ci, cj));
        }
        prevDir = d;
      }
      pts.push({ x: stop.x, y: stop.y });

      // Якоря лежат на границах фигур и могут быть не кратны сетке (y=198);
      // стыки якорь↔сетка доводим промежуточной точкой — ортогональность.
      if (pts.length > 1 && pts[0].x !== pts[1].x && pts[0].y !== pts[1].y) {
        pts.splice(1, 0, { x: pts[1].x, y: pts[0].y });
      }
      const n = pts.length;
      if (n > 1 && pts[n - 2].x !== pts[n - 1].x && pts[n - 2].y !== pts[n - 1].y) {
        pts.splice(n - 1, 0, { x: pts[n - 1].x, y: pts[n - 2].y });
      }

      // occupancy: ячейки пути + 4-соседи (разнос каналов ≥10px), без своих фигур
      for (const idx2 of cells) {
        const ci = idx2 % w; const cj = Math.floor(idx2 / w);
        for (let dj = -1; dj <= 1; dj += 1) {
          for (let di = -1; di <= 1; di += 1) {
            // только сама ячейка и её 4-соседи (диагонали исключены: |di|+|dj|>1)
            if (Math.abs(di) + Math.abs(dj) > 1) continue;
            const ni = ci + di; const nj = cj + dj;
            if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
            if (insideOwn(ni, nj)) continue;
            occupied.add(`${ni},${nj}`);
          }
        }
      }
      return pts;
    }
  }
  return null;
}
