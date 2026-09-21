// Контур fix/canvas-nan-di-stuck-drag (P0-2/P0-3).
// Regex-based разбор DI-слоя BPMN XML без DOM — node-тестируемый.
// Назначение:
//   findNonFiniteDi(xml)      — найти нефинитные координаты DI
//                               (NaN / ±Infinity / отсутствующие атрибуты);
//   sanitizeDiFiniteness(xml) — починить XML до importXML: битые waypoints
//                               дропаются, edge с <2 валидных точек получает
//                               прямой маршрут из Bounds source/target,
//                               нефинитные компоненты Bounds заменяются на 0.
// BPMNEdge удалять нельзя: flow без DI не импортируется (missingdi-пробой
// аудита canvas-drag-stuck-after-1008).

const WAYPOINT_ATTRS = ["x", "y"];
const BOUNDS_ATTRS = ["x", "y", "width", "height"];

function parseAttrs(tag) {
  const attrs = {};
  const re = /([\w:]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function isNonFiniteValue(value) {
  if (value === undefined || value === null) return true;
  if (String(value).trim() === "") return true;
  return !Number.isFinite(Number(value));
}

function matchBlocks(xml, localName) {
  // Префикс namespace не фиксирован: bpmn-js сериализует Bounds как dc:Bounds
  // (DC), waypoints — di:waypoint (DD/DI); матчим по локальному имени тега.
  const re = new RegExp(
    `<([\\w.-]+):${localName}\\b[^>]*?(?:/>|>[\\s\\S]*?<\\/\\1:${localName}>)`,
    "g",
  );
  const blocks = [];
  let m;
  while ((m = re.exec(xml))) {
    blocks.push({ text: m[0], index: m.index, prefix: m[1] });
  }
  return blocks;
}

function matchSelfClosing(xml, localName) {
  const re = new RegExp(`<([\\w.-]+):${localName}\\b[^>]*?/>`, "g");
  const tags = [];
  let m;
  while ((m = re.exec(xml))) {
    tags.push({ tag: m[0], prefix: m[1] });
  }
  return tags;
}

function collectShapes(xml) {
  const shapes = new Map();
  for (const block of matchBlocks(xml, "BPMNShape")) {
    const open = parseAttrs(block.text.slice(0, block.text.indexOf(">") + 1));
    const id = open.bpmnElement;
    if (!id) continue;
    const boundsMatch = block.text.match(/<[\w.-]+:Bounds\b[^>]*?\/>/);
    const bounds = boundsMatch ? parseAttrs(boundsMatch[0]) : null;
    shapes.set(id, { boundsTag: boundsMatch ? boundsMatch[0] : null, bounds });
  }
  return shapes;
}

function collectEdges(xml) {
  const edges = [];
  for (const block of matchBlocks(xml, "BPMNEdge")) {
    const open = parseAttrs(block.text.slice(0, block.text.indexOf(">") + 1));
    const flowId = open.bpmnElement;
    if (!flowId) continue;
    const waypoints = [];
    const re = /<[\w.-]+:waypoint\b[^>]*?\/>/g;
    let m;
    while ((m = re.exec(block.text))) {
      waypoints.push({ tag: m[0], attrs: parseAttrs(m[0]) });
    }
    edges.push({ text: block.text, index: block.index, prefix: block.prefix, flowId, waypoints });
  }
  return edges;
}

function collectFlowRefs(xml) {
  const refs = new Map();
  const re = /<bpmn:[A-Za-z]+\b[^>]*>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = parseAttrs(m[0]);
    if (attrs.id && attrs.sourceRef && attrs.targetRef) {
      refs.set(attrs.id, { sourceRef: attrs.sourceRef, targetRef: attrs.targetRef });
    }
  }
  return refs;
}

export function findNonFiniteDi(xml) {
  if (!xml || typeof xml !== "string") return [];
  const found = [];
  for (const [elementId, shape] of collectShapes(xml)) {
    if (!shape.bounds) continue;
    for (const attr of BOUNDS_ATTRS) {
      const value = shape.bounds[attr];
      if (isNonFiniteValue(value)) {
        found.push({ kind: "bounds", elementId, attr, value: value ?? "" });
      }
    }
  }
  for (const edge of collectEdges(xml)) {
    for (const waypoint of edge.waypoints) {
      for (const attr of WAYPOINT_ATTRS) {
        const value = waypoint.attrs[attr];
        if (isNonFiniteValue(value)) {
          found.push({ kind: "waypoint", edgeId: edge.flowId, attr, value: value ?? "" });
        }
      }
    }
  }
  return found;
}

function finiteBoundsCenter(bounds) {
  if (!bounds) return null;
  const nums = BOUNDS_ATTRS.map((a) => Number(bounds[a]));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [x, y, width, height] = nums;
  return { x, y, width, height, cx: x + width / 2, cy: y + height / 2 };
}

function straightRoute(sourceBounds, targetBounds) {
  const src = finiteBoundsCenter(sourceBounds);
  const dst = finiteBoundsCenter(targetBounds);
  if (!src || !dst) {
    // Дегенеративный финитный маршрут — post-import layoutConnection переложит.
    return [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
  }
  const dx = dst.cx - src.cx;
  const dy = dst.cy - src.cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return [
      { x: dx >= 0 ? src.x + src.width : src.x, y: src.cy },
      { x: dx >= 0 ? dst.x : dst.x + dst.width, y: dst.cy },
    ];
  }
  return [
    { x: src.cx, y: dy >= 0 ? src.y + src.height : src.y },
    { x: dst.cx, y: dy >= 0 ? dst.y : dst.y + dst.height },
  ];
}

function waypointTag(point) {
  return `<di:waypoint x="${point.x}" y="${point.y}"/>`;
}

export function sanitizeDiFiniteness(xml) {
  if (!xml || typeof xml !== "string") return { xml, repaired: [] };
  const repaired = [];
  const shapes = collectShapes(xml);
  const refs = collectFlowRefs(xml);

  let healed = xml;

  // 1) Bounds: нефинитные компоненты → 0 (префикс namespace сохраняется).
  healed = healed.replace(/<([\w.-]+):Bounds\b[^>]*?\/>/g, (tag, prefix) => {
    const attrs = parseAttrs(tag);
    let owner = null;
    for (const [elementId, shape] of shapes) {
      if (shape.boundsTag === tag) owner = elementId;
    }
    let changed = false;
    const next = { ...attrs };
    for (const attr of BOUNDS_ATTRS) {
      if (isNonFiniteValue(attrs[attr])) {
        next[attr] = "0";
        changed = true;
        repaired.push({ kind: "bounds-fix", elementId: owner, attr, value: attrs[attr] ?? "" });
      }
    }
    if (!changed) return tag;
    const rest = Object.keys(next)
      .filter((k) => !BOUNDS_ATTRS.includes(k))
      .map((k) => ` ${k}="${next[k]}"`)
      .join("");
    return `<${prefix}:Bounds x="${next.x}" y="${next.y}" width="${next.width}" height="${next.height}"${rest}/>`;
  });

  // Перечитываем shapes после починки bounds — маршруты строим по healed.
  const healedShapes = collectShapes(healed);

  // 2) Waypoints: дроп битых, синтез маршрута при <2 валидных.
  const edgeBlocks = collectEdges(healed);
  // Идём с конца, чтобы индексы замены не плыли.
  for (let i = edgeBlocks.length - 1; i >= 0; i -= 1) {
    const edge = edgeBlocks[i];
    const valid = edge.waypoints.filter(
      (wp) => !WAYPOINT_ATTRS.some((attr) => isNonFiniteValue(wp.attrs[attr])),
    );
    const dropped = edge.waypoints.length - valid.length;
    if (dropped > 0) {
      repaired.push({ kind: "waypoint-drop", edgeId: edge.flowId, count: dropped });
    }
    if (dropped === 0) continue;

    let points = valid.map((wp) => ({ x: Number(wp.attrs.x), y: Number(wp.attrs.y) }));
    if (points.length < 2) {
      const ref = refs.get(edge.flowId);
      const route = straightRoute(
        ref ? healedShapes.get(ref.sourceRef)?.bounds : null,
        ref ? healedShapes.get(ref.targetRef)?.bounds : null,
      );
      points = route;
      repaired.push({ kind: "edge-relayout", edgeId: edge.flowId });
    }
    const openTag = edge.text.slice(0, edge.text.indexOf(">") + 1);
    const nextBlock = openTag + points.map(waypointTag).join("") + `</${edge.prefix}:BPMNEdge>`;
    healed = healed.slice(0, edge.index) + nextBlock + healed.slice(edge.index + edge.text.length);
  }

  return { xml: healed, repaired };
}
