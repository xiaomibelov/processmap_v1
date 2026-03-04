function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export const HYBRID_MIN_WIDTH = 60;
export const HYBRID_MIN_HEIGHT = 30;

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

export function clampHybridRect(rectRaw, options = {}) {
  const rect = asObject(rectRaw);
  const minWidth = Math.max(1, Number(options.minWidth || HYBRID_MIN_WIDTH));
  const minHeight = Math.max(1, Number(options.minHeight || HYBRID_MIN_HEIGHT));
  return {
    x: round1(rect.x),
    y: round1(rect.y),
    w: round1(Math.max(minWidth, Number(rect.w || 0))),
    h: round1(Math.max(minHeight, Number(rect.h || 0))),
  };
}

export function applyDrag(rectRaw, dxRaw, dyRaw) {
  const rect = clampHybridRect(rectRaw);
  return {
    x: round1(Number(rect.x || 0) + Number(dxRaw || 0)),
    y: round1(Number(rect.y || 0) + Number(dyRaw || 0)),
    w: round1(rect.w),
    h: round1(rect.h),
  };
}

export function canResizeHybridElement(typeRaw) {
  const type = toText(typeRaw).toLowerCase();
  return type === "rect" || type === "container" || type === "note";
}

export function applyResize(rectRaw, handleRaw, dxRaw, dyRaw, options = {}) {
  const rect = clampHybridRect(rectRaw, options);
  const handle = toText(handleRaw).toLowerCase();
  const dx = Number(dxRaw || 0);
  const dy = Number(dyRaw || 0);
  const minWidth = Math.max(1, Number(options.minWidth || HYBRID_MIN_WIDTH));
  const minHeight = Math.max(1, Number(options.minHeight || HYBRID_MIN_HEIGHT));

  let x = Number(rect.x || 0);
  let y = Number(rect.y || 0);
  let w = Number(rect.w || 0);
  let h = Number(rect.h || 0);

  if (handle.includes("e")) w += dx;
  if (handle.includes("s")) h += dy;
  if (handle.includes("w")) {
    x += dx;
    w -= dx;
  }
  if (handle.includes("n")) {
    y += dy;
    h -= dy;
  }

  if (w < minWidth) {
    if (handle.includes("w")) x -= minWidth - w;
    w = minWidth;
  }
  if (h < minHeight) {
    if (handle.includes("n")) y -= minHeight - h;
    h = minHeight;
  }

  return {
    x: round1(x),
    y: round1(y),
    w: round1(w),
    h: round1(h),
  };
}
