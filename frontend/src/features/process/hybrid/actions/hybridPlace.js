function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export function getDefaultHybridSize(typeRaw) {
  const type = toText(typeRaw).toLowerCase();
  if (type === "container") return { width: 320, height: 220 };
  if (type === "text") return { width: 180, height: 36 };
  return { width: 200, height: 70 };
}

export function buildHybridGhost(typeRaw, pointRaw) {
  const point = asObject(pointRaw);
  const x = Number(point.x || 0);
  const y = Number(point.y || 0);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const size = getDefaultHybridSize(typeRaw);
  return {
    type: toText(typeRaw).toLowerCase() || "rect",
    x: Math.round((x - (size.width / 2)) * 10) / 10,
    y: Math.round((y - (size.height / 2)) * 10) / 10,
    w: size.width,
    h: size.height,
  };
}

export function buildHybridElementAt(typeRaw, pointRaw, base = {}) {
  const point = asObject(pointRaw);
  const x = Number(point.x || 0);
  const y = Number(point.y || 0);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const type = ["text", "note", "container", "rect"].includes(toText(typeRaw).toLowerCase())
    ? toText(typeRaw).toLowerCase()
    : "rect";
  const size = getDefaultHybridSize(type);
  return {
    ...asObject(base),
    type,
    is_container: type === "container",
    visible: true,
    x: Math.round((x - (size.width / 2)) * 10) / 10,
    y: Math.round((y - (size.height / 2)) * 10) / 10,
    w: size.width,
    h: size.height,
    text: type === "text" ? "Text" : (type === "container" ? "Container" : ""),
    style: {
      stroke: "#334155",
      fill: type === "note" ? "#fff7d6" : (type === "container" ? "#f1f5f9" : "#f8fafc"),
      radius: 8,
      fontSize: 12,
    },
  };
}
