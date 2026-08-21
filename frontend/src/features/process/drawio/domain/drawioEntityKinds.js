export const OVERLAY_ENTITY_KINDS = Object.freeze({
  DRAWIO: "drawio",
  HYBRID: "hybrid",
  LEGACY: "legacy",
});

export function normalizeOverlayEntityKind(kindRaw) {
  const kind = String(kindRaw || "").trim().toLowerCase();
  if (kind === OVERLAY_ENTITY_KINDS.DRAWIO) return OVERLAY_ENTITY_KINDS.DRAWIO;
  if (kind === OVERLAY_ENTITY_KINDS.HYBRID) return OVERLAY_ENTITY_KINDS.HYBRID;
  if (kind === OVERLAY_ENTITY_KINDS.LEGACY) return OVERLAY_ENTITY_KINDS.LEGACY;
  return "";
}

export function isOverlayEntityKind(kindRaw) {
  return !!normalizeOverlayEntityKind(kindRaw);
}
