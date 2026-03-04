function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
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
