function asFiniteNumber(raw, fallback = null) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function readWaypoints(element) {
  const list = Array.isArray(element?.waypoints) ? element.waypoints : [];
  return list
    .map((point) => {
      const x = asFiniteNumber(point?.x, null);
      const y = asFiniteNumber(point?.y, null);
      if (x === null || y === null) return null;
      return { x, y };
    })
    .filter(Boolean);
}

function readPathLength(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let length = 0;
  for (let idx = 1; idx < points.length; idx += 1) {
    const prev = points[idx - 1];
    const curr = points[idx];
    length += Math.hypot(curr.x - prev.x, curr.y - prev.y);
  }
  return length;
}

function readElementBounds(element) {
  const x = asFiniteNumber(element?.x, null);
  const y = asFiniteNumber(element?.y, null);
  const width = asFiniteNumber(element?.width, null);
  const height = asFiniteNumber(element?.height, null);
  if (x !== null && y !== null && width !== null && height !== null && width > 0 && height > 0) {
    return { x, y, width, height, pathLength: 0 };
  }

  const points = readWaypoints(element);
  if (!points.length) return null;
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (let idx = 1; idx < points.length; idx += 1) {
    minX = Math.min(minX, points[idx].x);
    maxX = Math.max(maxX, points[idx].x);
    minY = Math.min(minY, points[idx].y);
    maxY = Math.max(maxY, points[idx].y);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    pathLength: readPathLength(points),
  };
}

export function readOverlayCanvasZoom(inst) {
  try {
    const canvas = inst?.get?.("canvas");
    const zoom = asFiniteNumber(canvas?.zoom?.(), 1);
    return clampNumber(zoom, 0.2, 4);
  } catch {
    return 1;
  }
}

export function buildOverlayGeometry({ element, isConnection = false, canvasZoom = 1 } = {}) {
  const zoom = clampNumber(asFiniteNumber(canvasZoom, 1), 0.2, 4);
  const bounds = readElementBounds(element);
  if (!bounds) {
    return {
      width: isConnection ? 58 : 72,
      anchorLeft: isConnection ? 29 : 36,
      topOffset: isConnection ? -10 : -14,
      zoom,
    };
  }

  const centerX = bounds.x + bounds.width / 2;
  const elementX = asFiniteNumber(element?.x, bounds.x);
  const anchorLeft = Math.round(Math.max(0, centerX - elementX));

  if (!isConnection) {
    // Task overlays should stay readable, but not dominate the task box.
    const visualWidth = bounds.width * zoom;
    // Widen task overlays by ~20% total (about +10% per side).
    const width = Math.round(clampNumber((visualWidth * 0.66 + 24) * 1.2, 76, 192));
    return {
      width,
      anchorLeft,
      topOffset: -14,
      zoom,
    };
  }

  // Sequence overlays should be smaller than task overlays and stay subordinate.
  const dominantSpan = Math.max(bounds.width, bounds.pathLength * 0.45);
  const visualWidth = dominantSpan * zoom;
  const width = Math.round(clampNumber(visualWidth * 0.32 + 20, 52, 116));
  return {
    width,
    anchorLeft,
    topOffset: -10,
    zoom,
  };
}
