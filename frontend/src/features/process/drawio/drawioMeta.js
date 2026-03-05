function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function clampNumber(valueRaw, fallback = 0, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function isDrawioXml(valueRaw) {
  return /^<mxfile[\s>]/i.test(toText(valueRaw));
}

export function normalizeDrawioMeta(valueRaw) {
  const value = asObject(valueRaw);
  return {
    enabled: value.enabled === true,
    locked: value.locked === true,
    opacity: clampNumber(value.opacity, 1, 0.05, 1),
    last_saved_at: toText(value.last_saved_at || value.lastSavedAt),
    doc_xml: isDrawioXml(value.doc_xml) ? toText(value.doc_xml) : "",
    svg_cache: toText(value.svg_cache || value.svgCache),
    page: {
      index: Math.max(0, Math.round(clampNumber(asObject(value.page).index, 0, 0))),
    },
    transform: {
      x: clampNumber(asObject(value.transform).x, 0),
      y: clampNumber(asObject(value.transform).y, 0),
    },
  };
}

function hasDrawioPayload(valueRaw) {
  const meta = normalizeDrawioMeta(valueRaw);
  return !!(meta.doc_xml || meta.svg_cache || meta.enabled);
}

export function mergeDrawioMeta(primaryRaw, fallbackRaw = {}) {
  const primary = normalizeDrawioMeta(primaryRaw);
  const fallback = normalizeDrawioMeta(fallbackRaw);
  if (!hasDrawioPayload(primary) && hasDrawioPayload(fallback)) {
    return {
      ...fallback,
      enabled: primary.enabled || fallback.enabled,
      locked: primary.locked || fallback.locked,
      opacity: primary.opacity || fallback.opacity,
    };
  }
  return primary;
}

export function serializeDrawioMeta(valueRaw) {
  return JSON.stringify(normalizeDrawioMeta(valueRaw));
}
