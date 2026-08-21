function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toFiniteNumber(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
}

export function clampNumber(valueRaw, minRaw, maxRaw) {
  const min = toFiniteNumber(minRaw, 0);
  const max = toFiniteNumber(maxRaw, min);
  const value = toFiniteNumber(valueRaw, min);
  if (min > max) return clampNumber(value, max, min);
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function resolveViewportRangeX(snapshotRaw = {}) {
  const snapshot = asObject(snapshotRaw);
  const viewbox = asObject(snapshot.viewbox);
  const inner = asObject(viewbox.inner);
  const content = asObject(snapshot.content);

  const viewboxWidth = Math.max(0, toFiniteNumber(viewbox.width, 0));
  const viewboxX = toFiniteNumber(viewbox.x, 0);

  const contentMinX = toFiniteNumber(
    content.x,
    toFiniteNumber(inner.x, viewboxX),
  );

  const contentWidthRaw = toFiniteNumber(
    content.width,
    toFiniteNumber(inner.width, viewboxWidth),
  );

  const contentWidth = Math.max(viewboxWidth, contentWidthRaw);
  const travelWidth = Math.max(0, contentWidth - viewboxWidth);
  const maxViewboxX = contentMinX + travelWidth;
  const clampedViewboxX = clampNumber(viewboxX, contentMinX, maxViewboxX);

  return {
    contentMinX,
    contentWidth,
    viewboxWidth,
    viewboxX: clampedViewboxX,
    travelWidth,
    maxViewboxX,
    canScroll: travelWidth > 0.001,
  };
}

export function resolveMinThumbFraction(trackWidthPxRaw, minThumbWidthPxRaw = 28) {
  const trackWidthPx = Math.max(0, toFiniteNumber(trackWidthPxRaw, 0));
  const minThumbWidthPx = Math.max(0, toFiniteNumber(minThumbWidthPxRaw, 28));
  if (!(trackWidthPx > 0)) return 1;
  return clampNumber(minThumbWidthPx / trackWidthPx, 0, 1);
}

export function projectRangeToThumb(rangeRaw = {}, options = {}) {
  const range = asObject(rangeRaw);
  const canScroll = range.canScroll === true;
  const contentWidth = Math.max(0, toFiniteNumber(range.contentWidth, 0));
  const viewboxWidth = Math.max(0, toFiniteNumber(range.viewboxWidth, 0));
  const travelWidth = Math.max(0, toFiniteNumber(range.travelWidth, 0));
  const contentMinX = toFiniteNumber(range.contentMinX, 0);
  const viewboxX = clampNumber(toFiniteNumber(range.viewboxX, contentMinX), contentMinX, contentMinX + travelWidth);

  const minThumbFraction = clampNumber(options.minThumbFraction, 0, 1);
  const visibleFractionRaw = contentWidth > 0 ? viewboxWidth / contentWidth : 1;
  const visibleFraction = clampNumber(visibleFractionRaw, 0, 1);
  const thumbWidthFraction = canScroll
    ? clampNumber(Math.max(visibleFraction, minThumbFraction), 0.02, 1)
    : 1;

  const maxThumbLeftFraction = Math.max(0, 1 - thumbWidthFraction);
  const viewboxStartFraction = canScroll && travelWidth > 0
    ? clampNumber((viewboxX - contentMinX) / travelWidth, 0, 1)
    : 0;

  const thumbLeftFraction = canScroll && maxThumbLeftFraction > 0
    ? clampNumber(viewboxStartFraction * maxThumbLeftFraction, 0, maxThumbLeftFraction)
    : 0;

  return {
    canScroll,
    visibleFraction,
    thumbWidthFraction,
    thumbLeftFraction,
    maxThumbLeftFraction,
  };
}

export function thumbLeftFractionToViewboxX(rangeRaw = {}, thumbLeftFractionRaw = 0, thumbWidthFractionRaw = 1) {
  const range = asObject(rangeRaw);
  const canScroll = range.canScroll === true;
  if (!canScroll) return toFiniteNumber(range.contentMinX, 0);

  const contentMinX = toFiniteNumber(range.contentMinX, 0);
  const travelWidth = Math.max(0, toFiniteNumber(range.travelWidth, 0));
  const thumbWidthFraction = clampNumber(thumbWidthFractionRaw, 0, 1);
  const maxThumbLeftFraction = Math.max(0, 1 - thumbWidthFraction);

  if (!(travelWidth > 0) || !(maxThumbLeftFraction > 0)) return contentMinX;

  const clampedThumbLeft = clampNumber(thumbLeftFractionRaw, 0, maxThumbLeftFraction);
  const viewboxStartFraction = clampedThumbLeft / maxThumbLeftFraction;
  return contentMinX + (viewboxStartFraction * travelWidth);
}

export function trackFractionToViewboxX(rangeRaw = {}, trackFractionRaw = 0, thumbWidthFractionRaw = 1) {
  const thumbWidthFraction = clampNumber(thumbWidthFractionRaw, 0, 1);
  const maxThumbLeftFraction = Math.max(0, 1 - thumbWidthFraction);
  const centeredThumbLeft = clampNumber(
    toFiniteNumber(trackFractionRaw, 0) - (thumbWidthFraction / 2),
    0,
    maxThumbLeftFraction,
  );
  return thumbLeftFractionToViewboxX(rangeRaw, centeredThumbLeft, thumbWidthFraction);
}

export function clientXToTrackFraction(clientXRaw, trackRectRaw = {}) {
  const rect = asObject(trackRectRaw);
  const left = toFiniteNumber(rect.left, 0);
  const width = Math.max(0, toFiniteNumber(rect.width, 0));
  if (!(width > 0)) return 0;
  const local = toFiniteNumber(clientXRaw, left) - left;
  return clampNumber(local / width, 0, 1);
}
