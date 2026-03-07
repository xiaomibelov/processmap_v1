function toText(value) {
  return String(value || "").trim();
}

export function clampDrawioOpacity(valueRaw, fallback = 1) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return Math.max(0.05, Math.min(1, Number(fallback || 1)));
  return Math.max(0.05, Math.min(1, value));
}

export function getDrawioOverlayStatus(drawioMetaRaw = {}) {
  const drawioMeta = drawioMetaRaw && typeof drawioMetaRaw === "object" ? drawioMetaRaw : {};
  const enabled = drawioMeta.enabled === true;
  const hasDoc = toText(drawioMeta.doc_xml).length > 0;
  const hasPreview = toText(drawioMeta.svg_cache).length > 0;
  const visibleOnCanvas = enabled && hasPreview;
  if (!enabled) {
    return {
      key: "off",
      label: "OFF",
      tone: "muted",
      enabled,
      hasDoc,
      hasPreview,
      visibleOnCanvas,
    };
  }
  if (!hasPreview) {
    return {
      key: "on_preview_missing",
      label: "ON · preview missing · hidden",
      tone: "warning",
      enabled,
      hasDoc,
      hasPreview,
      visibleOnCanvas,
    };
  }
  return {
    key: "on",
    label: "ON",
    tone: "ok",
    enabled,
    hasDoc,
    hasPreview,
    visibleOnCanvas,
  };
}
