import { normalizeHybridV2Doc } from "../hybridLayerV2.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function mapHybridItemById(listRaw, id, mapper) {
  return asArray(listRaw).map((rowRaw) => {
    const row = asObject(rowRaw);
    if (toText(row.id) !== id) return row;
    return mapper(row);
  });
}

export function updateElementText(hybridRaw, idRaw, textRaw) {
  const doc = normalizeHybridV2Doc(hybridRaw);
  const id = toText(idRaw);
  if (!id) return doc;
  return normalizeHybridV2Doc({
    ...doc,
    elements: mapHybridItemById(doc.elements, id, (row) => ({
      ...row,
      text: String(textRaw ?? ""),
    })),
  });
}

export function setElementVisible(hybridRaw, idRaw, visibleRaw) {
  const doc = normalizeHybridV2Doc(hybridRaw);
  const id = toText(idRaw);
  if (!id) return doc;
  const visible = !!visibleRaw;
  return normalizeHybridV2Doc({
    ...doc,
    elements: mapHybridItemById(doc.elements, id, (row) => ({ ...row, visible })),
    edges: mapHybridItemById(doc.edges, id, (row) => ({ ...row, visible })),
  });
}

export function setElementLocked(hybridRaw, idRaw, lockedRaw) {
  const doc = normalizeHybridV2Doc(hybridRaw);
  const id = toText(idRaw);
  if (!id) return doc;
  const locked = !!lockedRaw;
  const layerIds = new Set();
  if (asArray(doc.layers).some((rowRaw) => toText(asObject(rowRaw).id) === id)) {
    layerIds.add(id);
  }
  asArray(doc.elements).forEach((rowRaw) => {
    const row = asObject(rowRaw);
    if (toText(row.id) !== id) return;
    const layerId = toText(row.layer_id);
    if (layerId) layerIds.add(layerId);
  });
  asArray(doc.edges).forEach((rowRaw) => {
    const row = asObject(rowRaw);
    if (toText(row.id) !== id) return;
    const layerId = toText(row.layer_id);
    if (layerId) layerIds.add(layerId);
  });
  if (!layerIds.size) return doc;
  return normalizeHybridV2Doc({
    ...doc,
    layers: asArray(doc.layers).map((rowRaw) => {
      const row = asObject(rowRaw);
      if (!layerIds.has(toText(row.id))) return row;
      return { ...row, locked };
    }),
  });
}

export function updateElementStyle(hybridRaw, idRaw, patchRaw) {
  const doc = normalizeHybridV2Doc(hybridRaw);
  const id = toText(idRaw);
  const patch = asObject(patchRaw);
  if (!id || !Object.keys(patch).length) return doc;
  return normalizeHybridV2Doc({
    ...doc,
    elements: mapHybridItemById(doc.elements, id, (row) => ({
      ...row,
      style: {
        ...asObject(row.style),
        ...patch,
      },
    })),
  });
}

export function updateElementRect(hybridRaw, idRaw, rectRaw) {
  const doc = normalizeHybridV2Doc(hybridRaw);
  const id = toText(idRaw);
  const rect = asObject(rectRaw);
  if (!id) return doc;
  return normalizeHybridV2Doc({
    ...doc,
    elements: mapHybridItemById(doc.elements, id, (row) => ({
      ...row,
      x: Number(rect.x ?? row.x ?? 0),
      y: Number(rect.y ?? row.y ?? 0),
      w: Number(rect.w ?? row.w ?? 0),
      h: Number(rect.h ?? row.h ?? 0),
    })),
  });
}

// Backward-compat wrappers for existing callers during D2 transition.
export function updateHybridText(hybridRaw, idRaw, textRaw) {
  return updateElementText(hybridRaw, idRaw, textRaw);
}

export function updateHybridElementRect(hybridRaw, idRaw, rectRaw) {
  return updateElementRect(hybridRaw, idRaw, rectRaw);
}

export function setHybridItemVisible(hybridRaw, idRaw, visibleRaw) {
  return setElementVisible(hybridRaw, idRaw, visibleRaw);
}
