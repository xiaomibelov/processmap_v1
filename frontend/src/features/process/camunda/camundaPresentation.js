function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asText(value) {
  return String(value || "").trim();
}

function normalizeBool(value) {
  if (typeof value === "boolean") return value;
  const text = asText(value).toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "on";
}

export function normalizeCamundaPresentationState(rawValue) {
  const raw = asObject(rawValue);
  const showPropertiesOverlay = normalizeBool(
    raw.showPropertiesOverlay
      ?? raw.show_properties_overlay
      ?? raw.propertiesOverlay
      ?? raw.properties_overlay,
  );
  return {
    showPropertiesOverlay,
    show_properties_overlay: showPropertiesOverlay,
  };
}

export function normalizeCamundaPresentationMap(rawMap) {
  const source = asObject(rawMap);
  const out = {};
  Object.keys(source).forEach((rawElementId) => {
    const elementId = asText(rawElementId);
    if (!elementId) return;
    const normalized = normalizeCamundaPresentationState(source[rawElementId]);
    if (!normalized.showPropertiesOverlay) return;
    out[elementId] = normalized;
  });
  return out;
}

export function upsertCamundaPresentationByElementId(mapRaw, elementIdRaw, stateRaw) {
  const map = normalizeCamundaPresentationMap(mapRaw);
  const elementId = asText(elementIdRaw);
  if (!elementId) return map;
  const normalized = normalizeCamundaPresentationState(stateRaw);
  if (!normalized.showPropertiesOverlay) {
    const next = { ...map };
    delete next[elementId];
    return next;
  }
  return {
    ...map,
    [elementId]: normalized,
  };
}

export function removeCamundaPresentationByElementId(mapRaw, elementIdRaw) {
  const map = normalizeCamundaPresentationMap(mapRaw);
  const elementId = asText(elementIdRaw);
  if (!elementId || !Object.prototype.hasOwnProperty.call(map, elementId)) return map;
  const next = { ...map };
  delete next[elementId];
  return next;
}

export function shouldResetPropertiesOverlayPreviewForSelection(currentElementIdRaw, nextElementIdRaw) {
  const currentElementId = asText(currentElementIdRaw);
  const nextElementId = asText(nextElementIdRaw);
  if (!nextElementId) return true;
  if (!currentElementId) return true;
  return currentElementId !== nextElementId;
}
