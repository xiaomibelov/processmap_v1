function toText(value) {
  return String(value || "").trim();
}

function toNumber(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
}

export function resolveRuntimeResizeSurface(elementSnapshotRaw = {}) {
  const snapshot = elementSnapshotRaw && typeof elementSnapshotRaw === "object" ? elementSnapshotRaw : {};
  const tagName = toText(snapshot.tagName).toLowerCase();
  if (tagName === "rect") return "box";
  return "";
}

export function readRuntimeResizableSize(elementSnapshotRaw = {}) {
  const snapshot = elementSnapshotRaw && typeof elementSnapshotRaw === "object" ? elementSnapshotRaw : {};
  const surface = resolveRuntimeResizeSurface(snapshot);
  if (!surface) return null;
  const attrs = snapshot.attrs && typeof snapshot.attrs === "object" ? snapshot.attrs : {};
  const width = toNumber(attrs.width, NaN);
  const height = toNumber(attrs.height, NaN);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return {
    width,
    height,
  };
}

export function normalizeRuntimeResizeDimension(valueRaw, fallback, { min = 24, max = 1600 } = {}) {
  if (String(valueRaw ?? "").trim() === "") return Number(fallback || min);
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return Number(fallback || min);
  return Math.max(min, Math.min(max, Math.round(value)));
}
