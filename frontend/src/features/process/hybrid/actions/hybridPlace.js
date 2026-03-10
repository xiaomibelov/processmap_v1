function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

let localElementCounter = 0;

function nextElementId() {
  localElementCounter += 1;
  return `E${localElementCounter}`;
}

export function getDefaultShapeSpec(typeRaw) {
  const type = toText(typeRaw).toLowerCase();
  if (type === "container") {
    return {
      w: 320,
      h: 220,
      text: "Container",
      style: { stroke: "#334155", fill: "#f1f5f9", radius: 8, fontSize: 12 },
      is_container: true,
    };
  }
  if (type === "text") {
    return {
      w: 180,
      h: 36,
      text: "Text",
      style: { stroke: "#334155", fill: "transparent", radius: 0, fontSize: 12 },
      is_container: false,
    };
  }
  return {
    w: 200,
    h: 70,
    text: "",
    style: { stroke: "#334155", fill: "#f8fafc", radius: 8, fontSize: 12 },
    is_container: false,
  };
}

export function createElementAt(typeRaw, pointRaw, layerIdRaw, overridesRaw = {}) {
  const point = asObject(pointRaw);
  const x = Number(point.x || 0);
  const y = Number(point.y || 0);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const overrides = asObject(overridesRaw);
  const shapeType = ["rect", "container", "text"].includes(toText(typeRaw).toLowerCase())
    ? toText(typeRaw).toLowerCase()
    : "rect";
  const defaults = getDefaultShapeSpec(shapeType);
  const width = Number(overrides.w ?? defaults.w);
  const height = Number(overrides.h ?? defaults.h);

  return {
    id: toText(overrides.id) || nextElementId(),
    layer_id: toText(overrides.layer_id || layerIdRaw) || "L1",
    type: shapeType,
    is_container: overrides.is_container ?? defaults.is_container,
    visible: overrides.visible ?? true,
    x: round1(Number(overrides.x ?? (x - (width / 2)))),
    y: round1(Number(overrides.y ?? (y - (height / 2)))),
    w: round1(width),
    h: round1(height),
    text: String(overrides.text ?? defaults.text ?? ""),
    style: {
      ...asObject(defaults.style),
      ...asObject(overrides.style),
    },
  };
}

// Backward-compat wrappers for existing hybrid tools wiring during D2 transition.
export function getDefaultHybridSize(typeRaw) {
  const spec = getDefaultShapeSpec(typeRaw);
  return { width: Number(spec.w || 0), height: Number(spec.h || 0) };
}

export function buildHybridGhost(typeRaw, pointRaw) {
  const point = asObject(pointRaw);
  const x = Number(point.x || 0);
  const y = Number(point.y || 0);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const spec = getDefaultShapeSpec(typeRaw);
  return {
    type: toText(typeRaw).toLowerCase() || "rect",
    x: round1(x - (Number(spec.w || 0) / 2)),
    y: round1(y - (Number(spec.h || 0) / 2)),
    w: Number(spec.w || 0),
    h: Number(spec.h || 0),
  };
}

export function buildHybridElementAt(typeRaw, pointRaw, base = {}) {
  const baseObj = asObject(base);
  return createElementAt(
    typeRaw,
    pointRaw,
    baseObj.layer_id || "L1",
    baseObj,
  );
}

export function normalizeHybridStencilPayload(payloadRaw) {
  const payload = asObject(payloadRaw);
  const elements = asArray(payload.elements)
    .map((rowRaw) => {
      const row = asObject(rowRaw);
      const w = Number(row.w || 0);
      const h = Number(row.h || 0);
      const dx = Number(row.dx || 0);
      const dy = Number(row.dy || 0);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
      return {
        type: toText(row.type || "rect") || "rect",
        w: round1(w),
        h: round1(h),
        dx: round1(dx),
        dy: round1(dy),
        style: asObject(row.style),
        text: String(row.text || ""),
        is_container: row.is_container === true,
        visible: row.visible !== false,
      };
    })
    .filter(Boolean);
  const edges = asArray(payload.edges)
    .map((rowRaw) => {
      const row = asObject(rowRaw);
      const fromIndex = Number(row.from_index);
      const toIndex = Number(row.to_index);
      if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return null;
      return {
        from_index: fromIndex,
        to_index: toIndex,
        type: toText(row.type || "arrow") || "arrow",
        style: asObject(row.style),
      };
    })
    .filter(Boolean);
  const bbox = asObject(payload.bbox);
  const bboxW = Number(bbox.w || 0);
  const bboxH = Number(bbox.h || 0);
  return {
    elements,
    edges,
    bbox: {
      w: Number.isFinite(bboxW) && bboxW > 0 ? round1(bboxW) : round1(elements.reduce((max, row) => Math.max(max, Number(row.dx || 0) + Number(row.w || 0)), 0)),
      h: Number.isFinite(bboxH) && bboxH > 0 ? round1(bboxH) : round1(elements.reduce((max, row) => Math.max(max, Number(row.dy || 0) + Number(row.h || 0)), 0)),
    },
  };
}

export function instantiateHybridStencilAt(payloadRaw, pointRaw, options = {}) {
  const payload = normalizeHybridStencilPayload(payloadRaw);
  const point = asObject(pointRaw);
  const layerId = toText(options.layerId || "L1") || "L1";
  const makeElementId = typeof options.makeElementId === "function" ? options.makeElementId : nextElementId;
  const makeEdgeId = typeof options.makeEdgeId === "function" ? options.makeEdgeId : () => `A${Math.random().toString(36).slice(2, 8)}`;
  const anchorX = Number(point.x || 0);
  const anchorY = Number(point.y || 0);
  if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY) || !payload.elements.length) {
    return { elements: [], edges: [], bbox: payload.bbox };
  }
  const baseX = anchorX - (Number(payload.bbox.w || 0) / 2);
  const baseY = anchorY - (Number(payload.bbox.h || 0) / 2);
  const createdElements = payload.elements.map((row) => ({
    id: toText(makeElementId()) || nextElementId(),
    layer_id: layerId,
    type: toText(row.type || "rect") || "rect",
    visible: row.visible !== false,
    is_container: row.is_container === true,
    x: round1(baseX + Number(row.dx || 0)),
    y: round1(baseY + Number(row.dy || 0)),
    w: round1(row.w),
    h: round1(row.h),
    text: String(row.text || ""),
    style: asObject(row.style),
  }));
  const createdEdges = payload.edges
    .map((row) => {
      const fromElement = createdElements[Number(row.from_index)];
      const toElement = createdElements[Number(row.to_index)];
      if (!fromElement?.id || !toElement?.id) return null;
      return {
        id: toText(makeEdgeId()) || `A${Math.random().toString(36).slice(2, 8)}`,
        layer_id: layerId,
        type: toText(row.type || "arrow") || "arrow",
        visible: true,
        from: { element_id: fromElement.id, anchor: "auto" },
        to: { element_id: toElement.id, anchor: "auto" },
        waypoints: [],
        style: asObject(row.style),
      };
    })
    .filter(Boolean);
  return {
    elements: createdElements,
    edges: createdEdges,
    bbox: payload.bbox,
  };
}
