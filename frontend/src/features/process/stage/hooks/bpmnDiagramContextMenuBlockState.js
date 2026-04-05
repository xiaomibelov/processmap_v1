function toText(value) {
  return String(value || "").trim();
}

export function isHybridOwnershipActive(modeRaw) {
  const mode = toText(modeRaw).toLowerCase();
  return mode === "edit" || mode === "place" || mode === "bind";
}

export function isBpmnDiagramContextMenuBlocked({
  hasSession,
  tab,
  drawioEditorOpen,
  hybridPlacementHitLayerActive,
  hybridModeEffective,
} = {}) {
  if (!hasSession) return true;
  if (tab !== "diagram") return true;
  if (drawioEditorOpen) return true;
  if (hybridPlacementHitLayerActive) return true;
  if (isHybridOwnershipActive(hybridModeEffective)) return true;
  return false;
}

