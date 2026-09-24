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

function readPathMidpoint(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  const totalLength = readPathLength(points);
  if (!Number.isFinite(totalLength) || totalLength <= 0) return null;
  const half = totalLength / 2;
  let traversed = 0;
  for (let idx = 1; idx < points.length; idx += 1) {
    const prev = points[idx - 1];
    const curr = points[idx];
    const segmentLength = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (!Number.isFinite(segmentLength) || segmentLength <= 0) continue;
    if (traversed + segmentLength >= half) {
      const ratio = (half - traversed) / segmentLength;
      return {
        x: prev.x + (curr.x - prev.x) * ratio,
        y: prev.y + (curr.y - prev.y) * ratio,
      };
    }
    traversed += segmentLength;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y };
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

export function buildOverlayGeometry({
  element,
  isConnection = false,
  canvasZoom = 1,
  preferBelow = false,
  viewportTopLimit = null,
} = {}) {
  const zoom = clampNumber(asFiniteNumber(canvasZoom, 1), 0.2, 4);
  const bounds = readElementBounds(element);
  if (!bounds) {
    return {
      width: isConnection ? 58 : 72,
      anchorLeft: isConnection ? 29 : 36,
      topOffset: isConnection ? 0 : -20,
      zoom,
      placement: "above",
    };
  }

  if (!isConnection) {
    const centerX = bounds.x + bounds.width / 2;
    const elementX = asFiniteNumber(element?.x, bounds.x);
    const anchorLeft = Math.round(Math.max(0, centerX - elementX));
    // Chip width follows the on-screen node width (maxWidth = node width);
    // keep a floor so narrow nodes do not collapse the chip.
    const visualWidth = bounds.width * zoom;
    const width = Math.round(clampNumber(visualWidth, 76, Number.MAX_SAFE_INTEGER));
    // Above by default; below when the node sits so high that the chip would
    // leave the viewport/canvas top. Reserve = chip height + the 20px gap;
    // without an explicit viewport edge (bounds.y < 40) covers the
    // "node at the very top" case deterministically.
    const topLimit = asFiniteNumber(viewportTopLimit, null);
    const clipsTop = topLimit !== null
      ? bounds.y - 20 < topLimit
      : bounds.y < 40;
    const placement = preferBelow || clipsTop ? "below" : "above";
    // Element-local offsets: CSS translate(-50%, -100%) lifts the chip by its
    // own height, so top = -20 puts the chip bottom at nodeTop − 20; below
    // uses translate(-50%, 0), so top = height + 20 clears nodeBottom + 20.
    const topOffset = placement === "below"
      ? Math.round(bounds.height + 20)
      : -20;
    return {
      width,
      anchorLeft,
      topOffset,
      zoom,
      placement,
    };
  }

  const points = readWaypoints(element);
  const midpoint = readPathMidpoint(points);
  const anchorX = midpoint?.x ?? (bounds.x + bounds.width / 2);
  const anchorY = midpoint?.y ?? (bounds.y + bounds.height / 2);
  const elementX = asFiniteNumber(element?.x, bounds.x);
  const elementY = asFiniteNumber(element?.y, bounds.y);
  const anchorLeft = Math.round(Math.max(0, anchorX - elementX));
  const topOffset = Math.round(anchorY - elementY);

  // Sequence overlays should be smaller than task overlays and stay subordinate.
  const dominantSpan = Math.max(bounds.width, bounds.pathLength * 0.45);
  const visualWidth = dominantSpan * zoom;
  const width = Math.round(clampNumber(visualWidth * 0.32 + 20, 52, 116));
  return {
    width,
    anchorLeft,
    topOffset,
    zoom,
  };
}
